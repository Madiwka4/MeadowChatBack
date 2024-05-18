const express = require('express');
const { getUser, getAllUsers, createUser, getRoom, createDm, createRoom, getDm, getDms, getRoomById, deleteDm, deleteRoom
, getDmById, getMessagesFromRoom, createGroupchat, getGroupchatsByUser, 
    getGroupchat,
    getGroupchatById,
    getAllGroupchats,
    addGroupchatMember,
    getGroupchatMembers,
    deleteGroupchat,
    deleteGroupchatMember,
    checkGroupchatMember,
    getGroupchatByRoomId,
    getMemberCount,
    updateGroupchat,
    getRoomsFromGroupchat,
getUserById, getLastMessageFromRoom, getMessageNumberFromRoom,
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
    const userToSend = {
        username: user.username,
        userid: user.id,
        token: token
    }
    res.send(userToSend);
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
        if (!room.last_message) {
            room.last_message = {
                message: "No messages",
                author: "System",
                id: 0
            }
        }
        return room;
    }));
    console.log("Sent DM using get /dm: " + JSON.stringify(dms));
    res.send(dms);
});

router.get('/dm/:id', authenticate, async (req, res) => {
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    const roomId = req.params.id;
    const room = await getRoom(roomId);
    if (!room) {
        res.status(404).send("Room not found");
        return;
    }
    if (room.room_type === 0) {
        res.status(400).send("Room is not a DM");
        return;
    }
    const DM = await getDmById(roomId);
    if (DM.dm_rec1 !== user.id && DM.dm_rec2 !== user.id) {
        res.status(401).send("Unauthorized");
        return;
    }
    room.last_message = await getLastMessageFromRoom(roomId);
    if (!room.last_message) {
        room.last_message = {
            message: "No messages",
            author: "System",
            id: 0
        }
    }
    res.send(room);
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
    const messageNum = await getMessageNumberFromRoom(roomId);
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
            author: user.username,
            status: msg.message_socket_id
        }
    }));

    const response = {
        messages: messages, 
        notAll: (parseInt(start) + parseInt(messages.length)) < parseInt(messageNum)
    }
    console.log(start + " " + messages.length + " " + messageNum + " " + (start + messages.length));
    console.log((start + messages.length) < messageNum)
    res.send(response);

});

router.post('/group', authenticate, async (req, res) => {
    const { name, description } = req.body;
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }

    //regex check the name to alphanumeric
    const regex = /^[a-zA-Z0-9\s]+$/;

    if (!regex.test(name) || name.length > 20) {
        res.status(400).send("Group name must be alphanumeric and less than 20 characters");
        return;
    }

    if (description.length > 100) {
        res.status(400).send("Description must be less than 100 characters");
        return;
    }
    //check if user has more than 5 groups

    const groupchats = await getGroupchatsByUser(user.id);
    if (groupchats.length >= 5) {
        res.status(400).send("User has reached the maximum number of groups");
        return;
    }

    //check if group with the same name already exists
    const grouptest = await getGroupchat(name);
    if (grouptest) {
        res.status(400).send("Group name already exists");
        return;
    }

    const group = await createGroupchat(name, description, false, user.id);

    const result = await addGroupchatMember(group.id, user.id);
    res.send(group);
});

//get all the groups the user is in or owns
router.get('/group', authenticate, async (req, res) => {
    console.log("GET GROUPS")
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }
    const groupchats = await getGroupchatsByUser(user.id);
    console.log("!!!! GROUPCHARTS: " + JSON.stringify(groupchats));
    //find the rooms associated with the groupchats
    let promises = groupchats.map(async groupchat => {
        groupchat.room = await getRoomsFromGroupchat(groupchat.id);
        groupchat.members = await getGroupchatMembers(groupchat.id);
        groupchat.owner = groupchat.groupchat_creator;
        return groupchat;
    });

    const ans = await Promise.all(promises);
    console.log("Groupchats: " + JSON.stringify(ans));
    res.send(ans);
});

router.get('/group/:id', authenticate, async (req, res) => {
    const groupId = req.params.id;
    
    const groupchat = await getGroupchatById(groupId);
    if (!groupchat) {
        res.status(404).send("Group not found");
        return;
    }

    //make sure the user is a member of the group
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }

    const member = await checkGroupchatMember(groupId, user.id);
    if (!member) {
        res.status(401).send("Unauthorized");
        return;
    }
    res.send(groupchat);
});

//endpoint to invite a list of users to a group
router.post('/group/invite', authenticate, async (req, res) => {
    console.log(req.body)
    const groupId = req.body.room;
    const invitee = req.body.member;
    console.log("Group id: " + groupId);
    console.log("User: " + invitee);
    //check if group exists
    const groupchat = await getGroupchatByRoomId(groupId);
    console.log("Groupchat: " + JSON.stringify(groupchat));
    if (!groupchat) {
        res.status(404).send("Group not found");
        return;
    }

    //check if the user is the owner of the group
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }

    if (groupchat.groupchat_creator != user.id) {
        console.log(groupchat.groupchat_creator + " " + user.id)
        res.status(401).send("Unauthorized");
        return;
    }

    //check if the invitee exists
    const inviteeUser = await getUserById(invitee);
    console.log("Invitee: " + JSON.stringify(inviteeUser));
    if (!inviteeUser) {
        res.status(404).send("Invitee not found");
        return;
    }

    //check if the invitee is already a member of the group
    const member = await checkGroupchatMember(groupchat.id, invitee);
    if (member) {
        res.status(400).send("Invitee is already a member of the group");
        return;
    }

    //check if the user is trying to invite themselves
    if (invitee === user.id) {
        res.status(400).send("Cannot invite yourself");
        return;
    }
    

    //add the invitee to the group
    const result = await addGroupchatMember(groupchat.id, invitee).catch(err => {
        res.status(500).send("Error adding invitee to group");
        return;
    });
    res.status(200).send("Invite sent");


});

//endpoint to remove a user from a group

router.delete('/group/remove', authenticate, async (req, res) => {
    const groupId = req.query.room;
    const userId = req.query.member;
    console.log("Group id: " + groupId);
    //check if group exists
    const groupchat = await getGroupchatByRoomId(groupId);
    if (!groupchat) {
        res.status(404).send("Group not found");
        return;
    }

    //check if the user is the owner of the group
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }

    if (groupchat.groupchat_creator != user.id) {
        res.status(401).send("Unauthorized");
        return;
    }

    //check if the user is a member of the group
    const member = await checkGroupchatMember(groupchat.id, userId);
    if (!member) {
        res.status(404).send("User not found in group");
        return;
    }

    //remove user from group
    await deleteGroupchatMember(groupchat.id, userId);
    res.send("User removed from group");
});

//endpoint to delete a group
router.delete('/group', authenticate, async (req, res) => {
    const groupId = req.query.id;
    //check if group exists
    const groupchat = await getGroupchatById(groupId);
    if (!groupchat) {
        res.status(404).send("Group not found");
        return;
    }

    //check if the user is the owner of the group
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }

    if (groupchat.group_owner != user.id) {
        res.status(401).send("Unauthorized");
        return;
    }

    //delete group
    await deleteGroupchat(groupId);
    res.send("Group deleted");
});

router.put('/group', authenticate, async (req, res) => {
    const groupId = req.query.id;
    const { name, description } = req.body;
    //check if group exists
    const groupchat = await getGroupchatByRoomId(groupId);
    if (!groupchat) {
        res.status(404).send("Group not found");
        return;
    }

    //check if the user is the owner of the group
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUser(decoded.username);
    if (!user) {
        res.status(404).send("User not found");
        return;
    }

    if (groupchat.groupchat_creator != user.id) {
        console.log(groupchat.groupchat_creator + " || " + user.id)
        res.status(401).send("Unauthorized");
        return;
    }

    //regex check the name to alphanumeric
    const regex = /^[a-zA-Z0-9\s]+$/;

    if (!regex.test(name) || name.length > 20) {
        res.status(400).send("Group name must be alphanumeric and less than 20 characters");
        return;
    }

    if (description.length > 100) {
        res.status(400).send("Description must be less than 100 characters");
        return;
    }
    console.log("Updating group" + groupId + " " + name + " " + description)
    //update group
    await updateGroupchat(groupId, name, description).catch(err => {
        res.status(500).send("Error updating group" + err.message);
        return;
    });
    
    res.send("Group updated");
});

module.exports = router;