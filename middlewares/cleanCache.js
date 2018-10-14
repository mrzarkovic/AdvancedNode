const cacheBust = require('../services/cache').bust;

module.exports = async (req, res, next) => {
    await next();

    cacheBust(req.user.id);
};
