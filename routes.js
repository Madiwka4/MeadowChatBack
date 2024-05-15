const express = require('express');
const { getUser, getAllUsers, createUser, getRoom, createDm, createRoom, getDm, getDms, getRoomById, deleteDm, deleteRoom
, getDmById, getMessagesFromRoom,
getUserById, getLastMessageFromRoom
 } = require('./database');
const router = express.Router();
const jwt = require ('jsonwebtoken');
const bcrypt = require('bcrypt');
const { authenticate } = require('./middleware');

/*
    USER ROUTES
*/
router.get('/users/:username', authenticate, async (req, res) => {
    const username = req.params.username;
    const user = await getUser(username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }
    //remove the password from the user object
    delete user.password;
    res.send(user);
});

router.get('/users', authenticate, async (req, res) => {
    const users = await getAllUsers();
    users.forEach(user => {
        delete user.password;
    });
    res.send(users);
});

router.post('/users', authenticate, async (req, res) => {
    const { username, password } = req.body;
    const user = await createUser(username, password);
    res.send(user);
});


/*
    USER ROUTES END
*/


// AUTHENTICATION ROUTES

router.post('/login', async (req, res) => {
    console.log(req.body)

    const { username, password } = req.body;
    const user = await getUser(username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        res.status(401).send("Invalid password");
        return;
    }
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.send(token);
});

router.post('/register', async (req, res) => {
    const { username, password, password2 } = req.body;
    console.log(JSON.stringify(req.body))
    console.log(username + " " + password + " " + password2)
    if (password !== password2) {
        console.log("Passwords do not match")
        res.status(400).send("Passwords do not match");
        return;
    }
    const user = await getUser(username);
    if (user) {
        res.status(400).send("User already exists");
        return;
    }
    try{
        await createUser(username, password);
    } catch (error){
        res.status(400).send(error.message);
        return;
    }
    
    res.send("User created");
});

router.get('/verify', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).send("No token provided");
        return;
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.send(decoded);
    } catch (err) {
        res.status(401).send("Invalid token");
    }
});

//AUTHENTICATION ROUTES END


// DM ROUTES

router.post('/dm', authenticate, async (req, res) => {
    const recipient = req.body.username;
    console.log("Body: " + JSON.stringify(req.body))
    console.log("Recipientt: " + recipient)
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!recipient || !user) {
        res.status(400).send("Invalid request");
        return;
    }
    
    //check if recipient exists
    const recipientUser = await getUser(recipient);
    if (!recipientUser) {
        res.status(404).send("Recipient not found");
        return;
    }

    if (user.username === recipientUser.username) {
        res.status(400).send("Cannot DM yourself");
        return;
    }

    //check if DM already exists
    const dm = await getDm(user.id, recipientUser.id);
    if (dm) {
        res.status(400).send("DM already exists");
        return;
    }

    //create DM
    const roomName = `${user.id}${recipientUser.id}`;
    const room = await createRoom(roomName, "Direct message between " + user.username + " and " + recipientUser.username, false);
    //console.log("Room: " + JSON.stringify(room));
    const dm1 = await createDm(user.id, recipientUser.id, room.id);
    //console.log("DM1: " + JSON.stringify(dm1));
    if (!dm1) {
        res.status(500).send("Error creating DM");
        return;
    }
    res.send("Room created");
});

router.get('/dm', authenticate, async (req, res) => {
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }
    const dms = await getDms(user.id);
    dms.rooms = await Promise.all(dms.rooms.map(async (room) => {
        room.last_message = await getLastMessageFromRoom(room.id);
        return room;
    }));
    console.log("Sent DM using get /dm: " + JSON.stringify(dms));
    res.send(dms);
});

router.delete('/dm', authenticate, async (req, res) => {
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    const roomId = req.query.id;
    console.log(roomId)
    const DM = await getDmById(roomId);
    console.log(JSON.stringify(DM));
    const room = await getRoomById(DM.associated_room);
    console.log(JSON.stringify(room));
    if (DM.dm_rec1 === user.id || DM.dm_rec2 === user.id) {
        try{
            await deleteDm(DM.id);
            await deleteRoom(room.id);
            res.send("Room deleted");
        
        } catch (error) {
            res.status(500).send("Error deleting room");
        }
    } else {
        res.status(401).send("Unauthorized");
    }

})

router.get('/messages/', authenticate, async (req, res) => {
    console.log(req.params)
    console.log(req.query)
    const roomId = req.query.room;
    const start = req.query.start;
    const end = req.query.num;
    console.log("Room id: " + roomId);
    console.log("Start: " + start);
    console.log("End: " + end);

    let messages = await getMessagesFromRoom(roomId, start, end);
    //change it to match the format of {message, id, author}
    messages = await Promise.all(messages.map(async msg => {
        const user = await getUserById(msg.message_author);
        const date = new Date(msg.message_sent + 'Z')
        console.log("Reading date: " + date + " " + msg.message_sent + 'Z')
        const idstamp = date.getTime();
        console.log("ID: " + idstamp)
        
        // console.log("Date: " + date + msg.message_sent)
        // console.log("ID: " + idstamp)
        return {
            message: msg.message_text,
            id: idstamp,
            author: user.username
        }
    }));


    console.log("messages: " + JSON.stringify(messages));
    res.send(messages);

});

module.exports = router;