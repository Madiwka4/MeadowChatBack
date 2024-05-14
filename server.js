const express = require('express')
const app = express();
require('dotenv').config();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "http://localhost:5173", // Replace with your actual domain in production
    methods: ["GET", "POST"]
  }
});
const { join } = require('path');
const cors = require('cors'); // Install 'cors' module if you haven't
app.use(express.json());
app.use(cors());



const { initDb } = require('./database');
const routes = require('./routes');
const websockets = require('./websockets');



websockets(io);

initDb().catch(err => console.error(err));








// app.use(express.static(join(__dirname, '..', 'MeadowChatFront', 'dist')));
// app.get('*', (req, res) => {
//     res.sendFile(join(__dirname, '..', 'MeadowChatFront', 'dist', 'index.html'))
// });
app.use(express.static(join(__dirname, 'public')));
app.use(routes);

app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'))
});

http.listen(process.env.PORT, () => {
    console.log("Listening on port 3000")
});