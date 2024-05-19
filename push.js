const webpush = require('web-push');
webpush.setVapidDetails('mailto:madi.turgunov.03@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const { getSubscription } = require('./database');

const notifications = {};

notifications.sendNotification = async (subscription, dataToSend) => {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(dataToSend));
    } catch (err) {
        console.error(err);
    }
}

notifications.sendNotificationById = async (id, dataToSend) => {
    const subscriptionRaw = await getSubscription(id);
    const subscription = JSON.parse(subscriptionRaw.subscription);
    if (subscription) {
        await notifications.sendNotification(subscription, dataToSend);
    }
    else {
        console.error('Subscription not found');
    }
}

module.exports = notifications;
