// const rooms = {
//     general: {
//         name: "general",
//         description: "General chat room"
//     },
//     random: {
//         name: "random",
//         description: "Random chat room"
//     },
//     jokes: {
//         name: "jokes",
//         description: "Jokes chat room"
//     },
//     code: {
//         name: "code",
//         description: "Code chat room"
//     }
// };
const { getUser, getAllRooms, getDms, getDm, createMessage, getRoomById } = require('./database');
const jwt = require('jsonwebtoken');
const usersInRooms = {};
module.exports = function(io) {
    io.on('connection', async (socket) => {
        const token = socket.handshake.auth.token;
        console.log(token);
        if (!token) {
            console.log("No token provided");
            socket.emit("invalid token");
            socket.disconnect();
            return;
        }
        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            console.log("Invalid token, could be expired");
            socket.emit("invalid token");
            socket.disconnect();
            return;
        }

        const user = await getUser(decoded.username);
        if (!user) {
            console.log("User not found");
            socket.emit("invalid token");
            socket.disconnect();
            return;
        }


        console.log("Connection established from user " + user.username + " with id " + user.id);

        socket.on("get rooms", async () =>{
            const rooms = await getAllRooms();
            console.log("sending rooms: " + JSON.stringify(rooms));
            socket.emit("rooms", rooms);
        });

        socket.on("get dms", async() => {
            const dms = await getDms(user.id);
            socket.emit("dms", dms);
        });

        socket.on("join room", (room) => {
            socket.join(room);
            if (!usersInRooms[room]) {
                usersInRooms[room] = [];
            }
            usersInRooms[room].push(socket.id);
            console.log("User joined room: " + room);
            io.to(room).emit("user joined", socket.id);
        });


        socket.on("chat message", async (data) => {
            console.log(data);
            const roomId = data.room;
            console.log("requested room: " + roomId)
            const room = await getRoomById(roomId);
            console.log("room: " + JSON.stringify(room));
            const msg = {
                message: data.message.content,
                id: data.message.id,
                author: user.username,
            };
            console.log(user)
            console.log(user.username)
            console.log("RECV MSG: " + msg.message + "author: " +  msg.author + " in room: " + room.room_name);
            io.to(roomId).emit("chat message", msg);
            createMessage(msg.message, null, user.id, room.id);
        });

        // socket.on("direct message", (data) => {
        //     const recipientId = data.recipient;
        //     const msg = data.message;
        //     const author 
        // });

        socket.on("leave room", (roomName) => {
            socket.leave(roomName);
            if (!usersInRooms[roomName]) {
                return;
            }
            usersInRooms[roomName] = usersInRooms[roomName].filter(id => id !== socket.id);
            io.to(roomName).emit("user left", socket.id);
        });

        socket.on("disconnect", () =>{
            console.log("Connection lost")
        });
    });
}