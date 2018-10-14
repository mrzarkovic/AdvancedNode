const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
const exec = mongoose.Query.prototype.exec;
client.hget = util.promisify(client.hget);

const Cache = {
    tagsMap: {}
};

mongoose.Query.prototype.cache = function({ tag }) {
    this.useCache = true;
    this.tag = JSON.stringify(tag || '');
    if (Array.isArray(tag)) {
        tag.map(tagItem => {
            if (!Cache.tagsMap[JSON.stringify(tagItem)]) {
                Cache.tagsMap[JSON.stringify(tagItem)] = [];
            }
            Cache.tagsMap[JSON.stringify(tagItem)].push(this.tag);
        });
    } else {
        if (!Cache.tagsMap[JSON.stringify(tag)]) {
            Cache.tagsMap[JSON.stringify(tag)] = [];
        }
        Cache.tagsMap[JSON.stringify(tag)].push(this.tag);
    }

    return this;
};

mongoose.Query.prototype.exec = async function() {
    console.log('---- x ----');

    if (!this.useCache) {
        console.log('   skip redis');
        return exec.apply(this, arguments);
    }
    console.log('   use redis');
    const key = JSON.stringify({
        ...this.getQuery(),
        collection: this.mongooseCollection.name
    });

    let cacheValue = await client.hget(this.tag, key);
    if (cacheValue) {
        console.log('   - has cached value');
        const doc = JSON.parse(cacheValue);
        return Array.isArray(doc)
            ? doc.map(d => new this.model(d))
            : new this.model(doc);
    }
    console.log('   - no cached value');
    const result = await exec.apply(this, arguments);
    client.hset(this.tag, key, JSON.stringify(result));
    return result;
};

module.exports = {
    bust: function bust(tag) {
        const keys = Cache.tagsMap[JSON.stringify(tag)];
        if (Array.isArray(keys) && keys.length) {
            keys.map(key => {
                client.del(key);
            });
            console.log('DELETE: ' + tag);
            delete Cache.tagsMap[JSON.stringify(tag)];
        }
    }
};
