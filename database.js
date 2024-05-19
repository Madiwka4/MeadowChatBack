const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
const bcrypt = require('bcrypt');

const initDb = async () => {
    // Check if "users" table exists, if not, create it
    const usersTableExists = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'users'
        );
    `);

    if (!usersTableExists.rows[0].exists) {
        console.log("Table users does not exist, creating it...");
        await pool.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
        `);
    }

    // Check if "rooms" table exists, if not, create it
    const roomsTableExists = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'rooms'
        );
    `);

    if (!roomsTableExists.rows[0].exists) {
        console.log("Table rooms does not exist, creating it...");
        await pool.query(`
            CREATE TABLE rooms (
                id SERIAL PRIMARY KEY,
                room_name VARCHAR(255),
                room_description VARCHAR(255),
                room_public BOOLEAN DEFAULT TRUE
            );
        `);
    }

    // Check if "messages" table exists, if not, create it
    const messagesTableExists = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'messages'
        );
    `);

    if (!messagesTableExists.rows[0].exists) {
        console.log("Table messages does not exist, creating it...");
        await pool.query(`
            CREATE TABLE messages (
                id SERIAL PRIMARY KEY,
                message_text TEXT,
                message_attachment BYTEA,
                message_sent TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                message_author INTEGER REFERENCES users(id),
                message_socket_id VARCHAR(255),
                message_room INTEGER REFERENCES rooms(id)
            );
        `);
    }

    const dmsTableExists =  await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'dms'
        );
    `);
    

    if (!dmsTableExists.rows[0].exists) {
        console.log("Table dms does not exist, creating it...");
        await pool.query(`
            CREATE TABLE dms (
                id SERIAL PRIMARY KEY,
                dm_rec1 INTEGER REFERENCES users(id),
                dm_rec2 INTEGER REFERENCES users(id),
                associated_room INTEGER REFERENCES rooms(id)
            );
        `);
    }

    //check if "groupchats" table exists, if not, create it
    const groupchatsTableExists = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'groupchats'
        );
    `);

    if (!groupchatsTableExists.rows[0].exists) {
        console.log("Table groupchats does not exist, creating it...");
        await pool.query(`
            CREATE TABLE groupchats (
                id SERIAL PRIMARY KEY,
                groupchat_name VARCHAR(255),
                groupchat_description VARCHAR(255),
                groupchat_public BOOLEAN DEFAULT FALSE,
                groupchat_creator INTEGER REFERENCES users(id),
                groupchat_room INTEGER REFERENCES rooms(id)
            );
        `);
    }

    //check if "groupchat_members" table exists, if not, create it
    const groupchatMembersTableExists = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'groupchat_members'
        );
    `);

    if (!groupchatMembersTableExists.rows[0].exists) {
        console.log("Table groupchat_members does not exist, creating it...");
        await pool.query(`
            CREATE TABLE groupchat_members (
                id SERIAL PRIMARY KEY,
                groupchat_id INTEGER REFERENCES groupchats(id),
                user_id INTEGER REFERENCES users(id)
            );
        `);
    }

    //check if the subscription table exists, if not, create it
    const subscriptionsTableExists = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'subscriptions'
        );
    `);

    if (!subscriptionsTableExists.rows[0].exists) {
        console.log("Table subscriptions does not exist, creating it...");
        await pool.query(`
            CREATE TABLE subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) UNIQUE,
                subscription_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                subscription TEXT
            );
        `);
    }
    


    //check if "users" table is empty, if so, create a default user
    const users = await pool.query('SELECT * FROM users');
    if (users.rows.length === 0) {
        console.log("Creating default user...");
        await createUser(process.env.DEFAULT_USER_NAME, process.env.DEFAULT_USER_PASSWORD);
        await createUser('test', 'Test1234');
    }

    const rooms = await pool.query('SELECT * FROM rooms');
    if (rooms.rows.length === 0) {
        console.log("Creating default room...");
        await pool.query('INSERT INTO rooms(room_name, room_description) VALUES($1, $2)', ['General', 'General chat']);
        await pool.query('INSERT INTO rooms(room_name, room_description) VALUES($1, $2)', ['General 2', 'Code chat']);
    }
    

};

/*
    USER FUNCTIONS
*/

const createUser = async (username, password) => {
    //check if username matches standard regex
    if (!/^[a-zA-Z0-9_]{3,}$/.test(username)) {
        throw new Error('Invalid username');
    }
    //check if password matches standard regex
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/.test(password)) {
        throw new Error('Invalid password');
    }
    //check if username already exists
    const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
        throw new Error('User already exists');
    }

    password = await bcrypt.hash(password, 10);
    const query = {
        text: 'INSERT INTO users(username, password) VALUES($1, $2)',
        values: [username, password],
    };

    await pool.query(query);
}

const getUser = async (username) => {
    const query = {
        text: 'SELECT * FROM users WHERE username = $1',
        values: [username],
    };

    const result = await pool.query(query);
    return result.rows[0];
}

const getUserById = async (id) => {
    const query = {
        text: 'SELECT * FROM users WHERE id = $1',
        values: [id],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));

    return result.rows[0];
}

const deleteUser = async (username) => {
    const query = {
        text: 'DELETE FROM users WHERE username = $1',
        values: [username],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result;
}

const updateUser = async (username, password1, password2) => {
    if (password1 !== password2) {
        throw new Error('Passwords do not match');
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/.test(password1)) {
        throw new Error('Invalid password');
    }
    const password = await bcrypt.hash(password1, 10);
    const query = {
        text: 'UPDATE users SET password = $1 WHERE username = $2',
        values: [password, username],
    }

    const result = await pool.query(query).catch(err => console.error(err));
    return result;
}

const getAllUsers = async () => {
    const query = {
        text: 'SELECT * FROM users',
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result.rows;
}

/*
    USER FUNCTIONS END
*/ 

// MESSAGE FUNCTIONS

const createMessage = async (message_text, message_attachment, message_author, message_room, mode) => {
    const current_time = new Date().toISOString();
    const query = {
        text: 'INSERT INTO messages(message_text, message_attachment, message_author, message_room, message_sent, message_socket_id) VALUES($1, $2, $3, $4, $5, $6)',
        values: [message_text, message_attachment, message_author, message_room, current_time, mode],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result;
}

const getMessagesFromRoom = async (room_id, start, number) => {
    const query = {
        text: 'SELECT * FROM messages WHERE message_room = $1 ORDER BY message_sent DESC OFFSET $2 LIMIT $3',
        values: [room_id, start, number],
    };

    const result = await pool.query(query).catch(err => console.error(err));

    return result.rows;
}

const getMessageNumberFromRoom = async (room_id) => {
    const query = {
        text: 'SELECT COUNT(*) FROM messages WHERE message_room = $1',
        values: [room_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));

    return result.rows[0].count;
}

const getLastMessageFromRoom = async (room_id) => {
    const query = {
        text: 'SELECT * FROM messages WHERE message_room = $1 ORDER BY message_sent DESC LIMIT 1',
        values: [room_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));

    return result.rows[0];
}

const markRoomAsRead = async (room_id, user_id) => {
    const query = {
        text: 'UPDATE messages SET message_socket_id = 2 WHERE message_room = $1 AND message_author = $2',
        values: [room_id, user_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result;
}

// MESSAGE FUNCTIONS END

// ROOM FUNCTIONS

const createRoom = async (room_name, room_description, room_public) => {
    const query = {
        text: 'INSERT INTO rooms(room_name, room_description, room_public) VALUES($1, $2, $3) RETURNING *',
        values: [room_name, room_description, room_public],
    };
    const result = await pool
        .query(query)
        .catch(err => console.error(err));
    return result.rows[0];
}

const getRoom = async (room_name) => {
    const query = {
        text: 'SELECT * FROM rooms WHERE room_name = $1',
        values: [room_name],
    };

    const result
        = await pool.query(query)
        .catch(err => console.error(err));

    return result.rows[0];

}

const getRoomById = async (room_id) => {
    const query = {
        text: 'SELECT * FROM rooms WHERE id = $1',
        values: [room_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));

    console.log("ROOM BY ID: " + JSON.stringify(result.rows[0]));
    return result.rows[0];
}

const getAllRooms = async () => {
    const query = {
        text: 'SELECT * FROM rooms',
    };

    const result = await
        pool.query(query)
        .catch(err => console.error(err));

    var rooms = {};
    result.rows.forEach(row => {
        if (row.room_public != false) {
            rooms[row.room_name] = {
                name: row.room_name,
                description: row.room_description,
                id: row.id,
            };
        }
    });
    return rooms;

}

const createDm = async (dm_rec1, dm_rec2, associated_room) => {
    const query = {
        text: 'INSERT INTO dms(dm_rec1, dm_rec2, associated_room) VALUES($1, $2, $3) RETURNING *',
        values: [dm_rec1, dm_rec2, associated_room],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    //console.log("DM CREATED: " + JSON.stringify(result));
    return result.rows[0];
}

const getDm = async (dm_rec1, dm_rec2) => {
    console.log("DM_REC1: " + dm_rec1 + " DM_REC2: " + dm_rec2)
    const query = {
        text: 'SELECT * FROM dms WHERE dm_rec1 = $1 AND dm_rec2 = $2 OR dm_rec1 = $2 AND dm_rec2 = $1',
        values: [dm_rec1, dm_rec2],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result.rows[0];

}
//USES ROOM ID!
const getDmById = async (dm_id) => {
    const query = {
        text: 'SELECT * FROM dms WHERE associated_room = $1',
        values: [dm_id],
    };
    console.log("DM ID: " + dm_id);
    const result = await pool.query(query).catch(err => console.error(err));
    console.log("DM BY ID: " + JSON.stringify(result.rows[0]));
    return result.rows[0];
}

const getDms = async (user_id) => {
    const query = {
        text: 'SELECT * FROM dms WHERE dm_rec1 = $1 OR dm_rec2 = $1',
        values: [user_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));

    var rooms = {};
    const promises = result.rows.map(async row => {
        //find the associated room
        const room = await getRoomById(row.associated_room);
        //room name is equal to the dm_rec that is not the user's username
        const recipient = row.dm_rec1 == user_id ? await getUserById(row.dm_rec2) : await getUserById(row.dm_rec1);
        //console.log("Recipient:" + recipient);
        rooms[room.room_name] = {
            name: recipient.username,
            description: room.room_description,
            id: room.id,
            room_name: room.room_name,
        };
    });
    await Promise.all(promises);
    console.log(JSON.stringify(rooms));

    const response = {rooms: rooms, dms: result.rows};

    return response;
}

const getDmByRoomName = async (room_name) => {
    const query = {
        text: 'SELECT * FROM dms WHERE associated_room = $1',
        values: [room_name],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result.rows[0];
}

const deleteDm = async (dm_id) => {
    const query = {
        text: 'DELETE FROM dms WHERE id = $1',
        values: [dm_id],
    };

    return await pool.query
        (query)
        .catch(err => console.error(err));

}

const deleteRoom = async (room_id) => {
    //delete all messages in the room
    const query_prior = {
        text: 'DELETE FROM messages WHERE message_room = $1',
        values: [room_id],
    };

    const prior_result = await pool.query(query_prior).catch(err => console.error(err));

    const query = {
        text: 'DELETE FROM rooms WHERE id = $1',
        values: [room_id],
    };

    return await pool.query
        (query)
        .catch(err => console.error(err));

}

// ROOM FUNCTIONS END

// GROUPCHAT FUNCTIONS

const createGroupchat = async (groupchat_name, groupchat_description, groupchat_public, groupchat_creator) => {
    const numberOfGroupchats = await pool.query('SELECT * FROM groupchats WHERE groupchat_creator = $1', [groupchat_creator]);
    if (numberOfGroupchats.rows.length >= 5) {
        throw new Error('You have reached the maximum number of groupchats');
    }
    const room_name = groupchat_creator + "_" + numberOfGroupchats.rows.length;
    const room_description = 'Groupchat room for ' + groupchat_creator + ' ' + numberOfGroupchats.rows.length;

    const pre_query ={
        text: 'INSERT INTO rooms(room_name, room_description, room_public) VALUES($1, $2, $3) RETURNING *',
        values: [room_name, room_description, false],
    }

    const room = await pool.query(pre_query).catch(err => console.error(err));

    if (!room) {
        throw new Error('Error creating room');
    }

    const groupchat_room = room.rows[0].id;

    const query = {
        text: 'INSERT INTO groupchats(groupchat_name, groupchat_description, groupchat_public, groupchat_creator, groupchat_room) VALUES($1, $2, $3, $4, $5) RETURNING *',
        values: [groupchat_name, groupchat_description, groupchat_public, groupchat_creator, groupchat_room],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result.rows[0];
}

const getGroupchat = async (groupchat_name) => {
    const query = {
        text: 'SELECT * FROM groupchats WHERE groupchat_name = $1',
        values: [groupchat_name],
    };

    const result
        = await pool.query(query)
        .catch(err => console.error(err));

    return result.rows[0];

}

const getGroupchatById = async (groupchat_id) => {
    const query = {
        text: 'SELECT * FROM groupchats WHERE id = $1',
        values: [groupchat_id],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));

    return result.rows[0];
}

const getGroupchatByRoomId = async (room_id) => {
    const query = {
        text: 'SELECT * FROM groupchats WHERE groupchat_room = $1',
        values: [room_id],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));

    return result.rows[0];
}

const getAllGroupchats = async () => {
    const query = {
        text: 'SELECT * FROM groupchats',
    };

    const result = await
        pool.query(query)
        .catch(err => console.error(err));

    var groupchats = {};
    result.rows.forEach(row => {
        groupchats[row.groupchat_name] = {
            name: row.groupchat_name,
            description: row.groupchat_description,
            id: row.id,
        };
    });
    return groupchats;

}

const addGroupchatMember = async (groupchat_id, user_id) => {
    console.log("ADDING MEMBER: " + groupchat_id + " " + user_id)
    const query = {
        text: 'INSERT INTO groupchat_members(groupchat_id, user_id) VALUES($1, $2)',
        values: [groupchat_id, user_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result;
}

const getGroupchatMembers = async (groupchat_id) => {
    const query = {
        text: `
        SELECT users.id, users.username
        FROM groupchat_members 
        INNER JOIN users ON groupchat_members.user_id = users.id 
        WHERE groupchat_members.groupchat_id = $1
        `,
        values: [groupchat_id],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));

    return result.rows;
}

const getMemberCount = async (groupchat_id) => {
    const query = {
        text: 'SELECT COUNT(*) FROM groupchat_members WHERE groupchat_id = $1',
        values: [groupchat_id],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));

    if (!result.rows[0]) {
        return 0;
    }

    return result.rows[0].count;
}

const deleteGroupchat = async (groupchat_id) => {
    const query = {
        text: 'DELETE FROM groupchats WHERE id = $1',
        values: [groupchat_id],
    };

    return await pool.query
        (query)
        .catch(err => console.error(err));

}

const deleteGroupchatMember = async (groupchat_id, user_id) => {
    const query = {
        text: 'DELETE FROM groupchat_members WHERE groupchat_id = $1 AND user_id = $2',
        values: [groupchat_id, user_id],
    };

    return await pool.query
        (query)
        .catch(err => console.error(err));

}

const checkGroupchatMember = async (groupchat_id, user_id) => {
    const query = {
        text: 'SELECT * FROM groupchat_members WHERE groupchat_id = $1 AND user_id = $2',
        values: [groupchat_id, user_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result.rows[0];
}

const getRoomsFromGroupchat = async (groupchat_id) => {
    const query = {
        text: `
            SELECT rooms.* 
            FROM rooms 
            INNER JOIN groupchats ON rooms.id = groupchats.groupchat_room 
            WHERE groupchats.id = $1
        `,
        values: [groupchat_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));

    return result.rows[0];
}

const getGroupchatsByUser = async (user_id) => {
    const query = {
        text: `
            SELECT groupchats.* 
            FROM groupchats 
            JOIN groupchat_members ON groupchats.id = groupchat_members.groupchat_id 
            WHERE groupchat_members.user_id = $1
        `,
        values: [user_id],
    };

    const result = await pool.query(query).catch(err => console.error(err));
    return result.rows;
    
}

const updateGroupchat = async (groupchat_id, groupchat_name, groupchat_description) => {
    const query = {
        text: 'UPDATE groupchats SET groupchat_name = $1, groupchat_description = $2 WHERE groupchat_room = $3',
        values: [groupchat_name, groupchat_description, groupchat_id],
    };
    console.log("UPDATING GROUPCHAT: " + groupchat_id + " " + groupchat_name + " " + groupchat_description)
    const result = await pool.query(query).catch(err => console.error(err));
    return result;
}

// GROUPCHAT FUNCTIONS END

// SUBSCRIPTION FUNCTIONS

const createSubscription = async (user_id, subscription) => {
    const query = {
        text: 'INSERT INTO subscriptions(user_id, subscription) VALUES($1, $2) ON CONFLICT (user_id) DO UPDATE SET subscription = EXCLUDED.subscription, subscription_date = CURRENT_TIMESTAMP',
        values: [user_id, subscription],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));

    return result;
}

const getSubscription = async (user_id) => {
    const query = {
        text: 'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY subscription_date DESC LIMIT 1',
        values: [user_id],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));
    console.log("SUBSCRIPTION: " + JSON.stringify(result.rows[0]));
    return result.rows[0];
}

const deleteSubscription = async (user_id) => {
    const query = {
        text: 'DELETE FROM subscriptions WHERE user_id = $1',
        values: [user_id],
    };

    const result = await pool
        .query(query)
        .catch(err => console.error(err));
console.log("DELETED SUBSCRIPTION: " + JSON.stringify(result));
    return result;
}



module.exports = {
    createUser,
    getUser,
    getUserById,
    deleteUser,
    updateUser,
    getAllUsers,
    initDb,
    getMessageNumberFromRoom,
    getAllRooms,
    getRoom,
    createRoom,
    createDm,
    getDm,
    getDms,
    getRoomById,
    deleteRoom,
    deleteDm,
    getDmById,
    createMessage,
    getMessagesFromRoom,
    getLastMessageFromRoom,
    markRoomAsRead,
    createGroupchat,
    getGroupchat,
    getGroupchatById,
    getAllGroupchats,
    addGroupchatMember,
    getGroupchatMembers,
    deleteGroupchat,
    deleteGroupchatMember,
    checkGroupchatMember,
    getRoomsFromGroupchat,
    getGroupchatsByUser,
    getMemberCount,
    getGroupchatByRoomId,
    updateGroupchat,
    createSubscription,
    getSubscription,
    deleteSubscription,
};
