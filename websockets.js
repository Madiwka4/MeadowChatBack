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
const { getUser, getAllRooms, getDms, getDm, createMessage, getRoomById, getDmById } = require('./database');
const jwt = require('jsonwebtoken');
const usersInRooms = {};
const userSockets = {};
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

        userSockets[user.id] = socket.id;
        console.log(userSockets);

        //check all DMs and see if the other user is online

        const tdms = await getDms(user.id);
        const trooms = tdms.rooms;
        const tmapIdToRoomKey = {};
        Object.keys(trooms).forEach(key => {
            let room = trooms[key];
            tmapIdToRoomKey[room.id] = key;
        });
        console.log("Map: " + JSON.stringify(tmapIdToRoomKey));
        const tdmObjects = tdms.dms
        console.log("DMs: " + JSON.stringify(tdmObjects)
        );
        console.log("Rooms: " + JSON.stringify(trooms));
        //check if each DM has the other user online
        tdmObjects.forEach(async(dm) => {
            const otherUser = dm.dm_rec1 === user.id ? dm.dm_rec2 : dm.dm_rec1;
            if (userSockets[otherUser]) {
                io.to(userSockets[otherUser]).emit("friend online", trooms[tmapIdToRoomKey[dm.associated_room]]);
            }
        });


        console.log("Connection established from user " + user.username + " with id " + user.id);

        socket.on("get rooms", async () =>{
            const rooms = await getAllRooms();
            console.log("sending rooms: " + JSON.stringify(rooms));
            socket.emit("rooms", rooms);
        });

        socket.on("get dms", async() => {
            const dms = await getDms(user.id);
            console.log("getting dms: " + JSON.stringify(dms));
            const rooms = dms.rooms;
            const mapIdToRoomKey = {};
            Object.keys(rooms).forEach(key => {
                let room = rooms[key];
                mapIdToRoomKey[room.id] = key;
            });
            console.log("Map: " + JSON.stringify(mapIdToRoomKey));
            const dmObjects = dms.dms
            console.log("DMs: " + JSON.stringify(dmObjects)
            );
            console.log("Rooms: " + JSON.stringify(rooms));
            //check if each DM has the other user online
            dmObjects.forEach(async(dm) => {
                const otherUser = dm.dm_rec1 === user.id ? dm.dm_rec2 : dm.dm_rec1;
                if (userSockets[otherUser]) {
                    rooms[mapIdToRoomKey[dm.associated_room]].online = true;
                }
                else{
                    rooms[mapIdToRoomKey[dm.associated_room]].online = false;
                }
                if(usersInRooms[dm.associated_room] && usersInRooms[dm.associated_room].length > 0){
                    rooms[mapIdToRoomKey[dm.associated_room]].inchat = true;
                }
                else{
                    rooms[mapIdToRoomKey[dm.associated_room]].inchat = false;
                }
                console.log("Users in room: " + JSON.stringify(usersInRooms));
                console.log("User sockets: " + JSON.stringify(userSockets));
            });
            console.log("sending dms: " + JSON.stringify(rooms));
            socket.emit("dms", rooms);
        });

        socket.on("join room", async(room) => {
            socket.join(room);
            if (!usersInRooms[room]) {
                usersInRooms[room] = [];
            }
            usersInRooms[room].push(socket.id);
            console.log("User joined room: " + room);
            //check if this is a DM
            const dm = await getDmById(room);
            const roomName = await getRoomById(room);
            if (dm) {
                console.log("DM found: " + JSON.stringify(dm));
                const otherUser = dm.dm_rec1 === user.id ? dm.dm_rec2 : dm.dm_rec1;
                console.log("Other user: " + otherUser);
                if (!userSockets[otherUser]) {
                    console.log(userSockets);
                    console.log("Other user not online");
                }
                else{
                    console.log("Other user online");
                    io.to(userSockets[otherUser]).emit("guest joined", roomName);
                }
            }
            io.to(room).emit("user joined", user.username);
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

            //check if room is a DM
            const dm = await getDmById(roomId);
            if (dm) {
                console.log("DM found: " + JSON.stringify(dm));
                const otherUser = dm.dm_rec1 === user.id ? dm.dm_rec2 : dm.dm_rec1;
                console.log("Other user: " + otherUser);
                if (!userSockets[otherUser]) {
                    console.log(userSockets);
                    console.log("Other user not online");
                }
                else{
                    console.log("Other user online");
                    io.to(userSockets[otherUser]).emit("chat notiff", room);
                }
            }

            createMessage(msg.message, null, user.id, room.id);
        });

        // socket.on("direct message", (data) => {
        //     const recipientId = data.recipient;
        //     const msg = data.message;
        //     const author 
        // });

        socket.on("leave room", async (roomName) => {
            socket.leave(roomName);
            if (!usersInRooms[roomName]) {
                return;
            }
            usersInRooms[roomName] = usersInRooms[roomName].filter(id => id !== socket.id);

            const dm = await getDmById(roomName);
            const roomObject = await getRoomById(roomName);
            if (dm) {
                console.log("DM found: " + JSON.stringify(dm));
                const otherUser = dm.dm_rec1 === user.id ? dm.dm_rec2 : dm.dm_rec1;
                console.log("Other user: " + otherUser);
                if (!userSockets[otherUser]) {
                    console.log(userSockets);
                    console.log("Other user not online");
                }
                else{
                    console.log("Other user online");
                    io.to(userSockets[otherUser]).emit("guest left", roomObject);
                }
            }

            io.to(roomName).emit("user left", user.username);
        });

        socket.on("disconnect", async () =>{
            console.log("Connection lost")
            //erase user from usersInRooms
            Object.keys(usersInRooms).forEach(room => {
                usersInRooms[room] = usersInRooms[room].filter(id => id !== socket.id);
            });
                const tdms = await getDms(user.id);
                const trooms = tdms.rooms;
                const tmapIdToRoomKey = {};
                Object.keys(trooms).forEach(key => {
                let room = trooms[key];
                tmapIdToRoomKey[room.id] = key;
                });
                console.log("Map: " + JSON.stringify(tmapIdToRoomKey));
                const tdmObjects = tdms.dms
                console.log("DMs: " + JSON.stringify(tdmObjects)
                );
                console.log("Rooms: " + JSON.stringify(trooms));
                //check if each DM has the other user online
                tdmObjects.forEach(async(dm) => {
                const roomObject = await getRoomById(dm.associated_room);
                const otherUser = dm.dm_rec1 === user.id ? dm.dm_rec2 : dm.dm_rec1;
                if (userSockets[otherUser]) {
                io.to(userSockets[otherUser]).emit("guest left", roomObject);
                io.to(userSockets[otherUser]).emit("friend offline", trooms[tmapIdToRoomKey[dm.associated_room]]);
                }
                });
            delete userSockets[user.id];
        });
    });
}