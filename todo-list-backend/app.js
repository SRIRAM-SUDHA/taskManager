const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const format = require("date-fns/format");
const isMatch = require("date-fns/isMatch");
var isValid = require("date-fns/isValid");
const app = express();
app.use(express.json());

const cors = require("cors");
const { Console } = require("console");
app.use(
  cors({
    origin: "*", // Allow requests from any origin
  })
);

let db;
const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, "todo-list.db"),
      driver: sqlite3.Database,
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS user (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR UNIQUE ,
        password VARCHAR 
      );
    `);

    // Create Todo table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS todo (
        todo_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        task_description TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'in progress', 'completed', 'done')) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user (user_id) ON DELETE CASCADE
      );
    `);

    app.listen(3002, () => {
      console.log("Server is running on http://localhost:3002/");
    });
  } catch (error) {
    console.log(`Database error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBandServer();

// API: Register New User
app.post("/signup/", async (request, response) => {
  const { username, password } = request.body;
  console.log(username, password);
  const userCheckQuery = `
    SELECT * FROM user WHERE username = ?;`;
  const dbUser = await db.get(userCheckQuery, [username]);
  if (dbUser === undefined) {
    const hashPassword = await bcrypt.hash(password, 10);
    console.log(hashPassword);

    const registerUserQuery = `
            INSERT INTO 
                user (username, password)
            VALUES
                (?, ?);`;
    await db.run(registerUserQuery, [username, hashPassword]);
    response.send("User created successfully");
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.headers.username = payload.username;
        next();
      }
    });
  }
};

// API: Login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  console.log(username, password);
  const userCheckQuery = `
    SELECT * FROM user WHERE username = ?;`;
  const dbUser = await db.get(userCheckQuery, [username]);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    console.log(dbUser);
    const isPasswordMatches = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatches) {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API: Create a new task
// app.post("/todos", authenticateToken, async (request, response) => {
//   const { task_description, status } = request.body;
//   const { username } = request.headers;

//   const getUserQuery = `SELECT user_id FROM user WHERE username = ?;`;
//   const dbUser = await db.get(getUserQuery, [username]);
//   const { user_id } = dbUser;

//   const createTaskQuery = `
//     INSERT INTO
//       todo (user_id, task_description, status)
//     VALUES
//       (?, ?, ?);
//   `;
//   await db.run(createTaskQuery, [user_id, task_description, status]);
//   response.send("Task Created Successfully");
// });

// API: Create a new task
app.post("/todos", authenticateToken, async (request, response) => {
  const { task_description, status } = request.body;
  const { username } = request.headers;

  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const { user_id } = dbUser;

  const createTaskQuery = `
    INSERT INTO 
      todo (user_id, task_description, status) 
    VALUES 
      (${user_id}, '${task_description}', '${status}');
  `;
  await db.run(createTaskQuery);
  response.send("Task Created Successfully");
});

// API: Get all tasks for a user
app.get("/todos", authenticateToken, async (request, response) => {
  const { username } = request.headers;

  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const { user_id } = dbUser;

  const getTasksQuery = `
    SELECT * FROM todo WHERE user_id = ${user_id};
  `;
  const tasks = await db.all(getTasksQuery);
  response.send(tasks);
});

// API: Update a task by its ID
app.put("/todos/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const { task_description, status } = request.body;

  const updateTaskQuery = `
    UPDATE todo 
    SET 
      task_description = '${task_description}', 
      status = '${status}'
    WHERE 
      todo_id = ${id};
  `;
  await db.run(updateTaskQuery);
  response.send("Task Updated Successfully");
});

// API: Delete a task by its ID
app.delete("/todos/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;

  const deleteTaskQuery = `DELETE FROM todo WHERE todo_id = ${id};`;
  await db.run(deleteTaskQuery);
  response.send("Task Deleted Successfully");
});

module.exports = app;
