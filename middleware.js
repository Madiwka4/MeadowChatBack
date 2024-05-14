const jwt = require('jsonwebtoken');

// Import necessary modules

// Define your authentication middleware function
const authenticate = (req, res, next) => {
    // Get the token from the request headers
    if (!req.headers.authorization) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = req.headers.authorization;

    // Check if token exists
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        // Verify the token
        console.log("Verifying token: " + token)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Attach the decoded user information to the request object
        req.user = decoded;

        // Call the next middleware
        next();
    } catch (error) {
        console.log("Gracefully handling error")
        console.log(error);
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Export the middleware function
module.exports = { authenticate };