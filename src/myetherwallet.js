'use strict';
const ethUtil = require('ethereumjs-util');
ethUtil.Tx = require('ethereumjs-tx');
const customNode = require('./custom_node');
const etherFuncs = require('./etherFuncs');
const etherUnits = require('./etherUnits');

var Wallet = function(priv, pub, path, hwType, hwTransport) {
    if (typeof priv != "undefined") {
        this.privKey = priv.length == 32 ? priv : Buffer(priv, 'hex')
    }
    this.pubKey = pub;
    this.path = path;
    this.hwType = hwType;
    this.hwTransport = hwTransport;
    this.type = "default";
}
Wallet.generate = function(icapDirect) {
    if (icapDirect) {
        while (true) {
            var privKey = ethUtil.crypto.randomBytes(32)
            if (ethUtil.privateToAddress(privKey)[0] === 0) {
                return new Wallet(privKey)
            }
        }
    } else {
        return new Wallet(ethUtil.crypto.randomBytes(32))
    }
}
Wallet.prototype.setTokens = function() {
    this.tokenObjs = [];
    var tokens = Token.popTokens;
    for (var i = 0; i < tokens.length; i++) {
        this.tokenObjs.push(new Token(tokens[i].address, this.getAddressString(), tokens[i].symbol, tokens[i].decimal, tokens[i].type, tokens[i].network));
        this.tokenObjs[this.tokenObjs.length - 1].setBalance();
    }
    var storedTokens = globalFuncs.localStorage.getItem("localTokens", null) != null ? JSON.parse(globalFuncs.localStorage.getItem("localTokens")) : [];
    for (var i = 0; i < storedTokens.length; i++) {
        this.tokenObjs.push(new Token(storedTokens[i].contractAddress, this.getAddressString(), globalFuncs.stripTags(storedTokens[i].symbol), storedTokens[i].decimal, storedTokens[i].type, storedTokens[i].network));
        this.tokenObjs[this.tokenObjs.length - 1].setBalance();
    }
}
Wallet.prototype.setBalance = function(callback) {
    var parentObj = this;
    this.balance = this.usdBalance = this.eurBalance = this.btcBalance = this.chfBalance = this.repBalance =  this.gbpBalance = 'loading';
    customNode.getBalance(parentObj.getAddressString(), function(data) {
        if (data.error) parentObj.balance = data.msg;
        else {
          parentObj.balance = etherUnits.toEther(data.data.balance, 'wei');
          if(callback) callback();
        }
    });
}

Wallet.prototype.getBalance = function(callback) {
    const self = this;
    customNode.getBalance(this.getAddressString(), function(data) {
        if (data.error) {
            self.balance = data.msg;
            callback(new Error(data.msg))
        }
        else {
            self.balance = etherUnits.toEther(data.data.balance, 'wei');
            if(callback) callback(null, self.balance);
        }
    });
}

Wallet.prototype.getTransactionCount = function (callback) {
    customNode.getTransactionCount(this.getAddressString(), function (data) {
        if (data.error) {
            return callback(new Error(data.msg))
        }
        callback(null, Number(data.data))
    })
}

Wallet.prototype.getPath = function() {
    return this.path;
}
Wallet.prototype.getHWType = function() {
    return this.hwType;
}
Wallet.prototype.getHWTransport = function() {
    return this.hwTransport;
}
Wallet.prototype.getPrivateKey = function() {
    return this.privKey
}
Wallet.prototype.getPrivateKeyString = function() {
    if (typeof this.privKey != "undefined") {
        return this.getPrivateKey().toString('hex')
    } else {
        return "";
    }
}
Wallet.prototype.getPublicKey = function() {
    if (typeof this.pubKey == "undefined") {
        return ethUtil.privateToPublic(this.privKey)
    } else {
        return this.pubKey;
    }
}
Wallet.prototype.getPublicKeyString = function() {
    if (typeof this.pubKey == "undefined") {
        return '0x' + this.getPublicKey().toString('hex')
    } else {
        return "0x" + this.pubKey.toString('hex')
    }
}
Wallet.prototype.getAddress = function() {
    if (typeof this.pubKey == "undefined") {
        return ethUtil.privateToAddress(this.privKey)
    } else {
        return ethUtil.publicToAddress(this.pubKey, true)
    }
}
Wallet.prototype.getAddressString = function() {
    return '0x' + this.getAddress().toString('hex')
}
Wallet.prototype.getChecksumAddressString = function() {
    return ethUtil.toChecksumAddress(this.getAddressString())
}
Wallet.fromPrivateKey = function(priv) {
    return new Wallet(priv)
}
Wallet.fromParityPhrase = function(phrase) {
    var hash = ethUtil.sha3(new Buffer(phrase));
    for (var i = 0; i < 16384; i++) hash = ethUtil.sha3(hash);
    while (ethUtil.privateToAddress(hash)[0] != 0) hash = ethUtil.sha3(hash);
    return new Wallet(hash);
}
Wallet.prototype.toV3 = function(password, opts) {
    opts = opts || {}
    var salt = opts.salt || ethUtil.crypto.randomBytes(32)
    var iv = opts.iv || ethUtil.crypto.randomBytes(16)
    var derivedKey
    var kdf = opts.kdf || 'scrypt'
    var kdfparams = {
        dklen: opts.dklen || 32,
        salt: salt.toString('hex')
    }
    if (kdf === 'pbkdf2') {
        kdfparams.c = opts.c || 262144
        kdfparams.prf = 'hmac-sha256'
        derivedKey = ethUtil.crypto.pbkdf2Sync(new Buffer(password), salt, kdfparams.c, kdfparams.dklen, 'sha256')
    } else if (kdf === 'scrypt') {
        // FIXME: support progress reporting callback
        kdfparams.n = opts.n || 262144
        kdfparams.r = opts.r || 8
        kdfparams.p = opts.p || 1
        derivedKey = ethUtil.scrypt(new Buffer(password), salt, kdfparams.n, kdfparams.r, kdfparams.p, kdfparams.dklen)
    } else {
        throw new Error('Unsupported kdf')
    }
    var cipher = ethUtil.crypto.createCipheriv(opts.cipher || 'aes-128-ctr', derivedKey.slice(0, 16), iv)
    if (!cipher) {
        throw new Error('Unsupported cipher')
    }
    var ciphertext = Buffer.concat([cipher.update(this.privKey), cipher.final()])
    var mac = ethUtil.sha3(Buffer.concat([derivedKey.slice(16, 32), new Buffer(ciphertext, 'hex')]))
    return {
        version: 3,
        id: ethUtil.uuid.v4({
            random: opts.uuid || ethUtil.crypto.randomBytes(16)
        }),
        address: this.getAddress().toString('hex'),
        Crypto: {
            ciphertext: ciphertext.toString('hex'),
            cipherparams: {
                iv: iv.toString('hex')
            },
            cipher: opts.cipher || 'aes-128-ctr',
            kdf: kdf,
            kdfparams: kdfparams,
            mac: mac.toString('hex')
        }
    }
}
Wallet.prototype.toJSON = function() {
    return {
        address: this.getAddressString(),
        checksumAddress: this.getChecksumAddressString(),
        privKey: this.getPrivateKeyString(),
        pubKey: this.getPublicKeyString(),
        publisher: "MyEtherWallet",
        encrypted: false,
        version: 2
    }
}
Wallet.fromMyEtherWallet = function(input, password) {
    var json = (typeof input === 'object') ? input : JSON.parse(input)
    var privKey
    if (!json.locked) {
        if (json.private.length !== 64) {
            throw new Error('Invalid private key length')
        }
        privKey = new Buffer(json.private, 'hex')
    } else {
        if (typeof password !== 'string') {
            throw new Error('Password required')
        }
        if (password.length < 7) {
            throw new Error('Password must be at least 7 characters')
        }
        var cipher = json.encrypted ? json.private.slice(0, 128) : json.private
        cipher = Wallet.decodeCryptojsSalt(cipher)
        var evp = Wallet.evp_kdf(new Buffer(password), cipher.salt, {
            keysize: 32,
            ivsize: 16
        })
        var decipher = ethUtil.crypto.createDecipheriv('aes-256-cbc', evp.key, evp.iv)
        privKey = Wallet.decipherBuffer(decipher, new Buffer(cipher.ciphertext))
        privKey = new Buffer((privKey.toString()), 'hex')
    }
    var wallet = new Wallet(privKey)
    if (wallet.getAddressString() !== json.address) {
        throw new Error('Invalid private key or address')
    }
    return wallet
}
Wallet.fromMyEtherWalletV2 = function(input) {
    var json = (typeof input === 'object') ? input : JSON.parse(input);
    if (json.privKey.length !== 64) {
        throw new Error('Invalid private key length');
    };
    var privKey = new Buffer(json.privKey, 'hex');
    return new Wallet(privKey);
}
Wallet.fromEthSale = function(input, password) {
    var json = (typeof input === 'object') ? input : JSON.parse(input)
    var encseed = new Buffer(json.encseed, 'hex')
    var derivedKey = ethUtil.crypto.pbkdf2Sync(Buffer(password), Buffer(password), 2000, 32, 'sha256').slice(0, 16)
    var decipher = ethUtil.crypto.createDecipheriv('aes-128-cbc', derivedKey, encseed.slice(0, 16))
    var seed = Wallet.decipherBuffer(decipher, encseed.slice(16))
    var wallet = new Wallet(ethUtil.sha3(seed))
    if (wallet.getAddress().toString('hex') !== json.ethaddr) {
        throw new Error('Decoded key mismatch - possibly wrong passphrase')
    }
    return wallet
}
Wallet.fromMyEtherWalletKey = function(input, password) {
    var cipher = input.slice(0, 128)
    cipher = Wallet.decodeCryptojsSalt(cipher)
    var evp = Wallet.evp_kdf(new Buffer(password), cipher.salt, {
        keysize: 32,
        ivsize: 16
    })
    var decipher = ethUtil.crypto.createDecipheriv('aes-256-cbc', evp.key, evp.iv)
    var privKey = Wallet.decipherBuffer(decipher, new Buffer(cipher.ciphertext))
    privKey = new Buffer((privKey.toString()), 'hex')
    return new Wallet(privKey)
}
Wallet.fromV3 = function(input, password, nonStrict) {
    var json = (typeof input === 'object') ? input : JSON.parse(nonStrict ? input.toLowerCase() : input)
    if (json.version !== 3) {
        throw new Error('Not a V3 wallet')
    }
    var derivedKey
    var kdfparams
    if (json.crypto.kdf === 'scrypt') {
        kdfparams = json.crypto.kdfparams
        derivedKey = ethUtil.scrypt(new Buffer(password), new Buffer(kdfparams.salt, 'hex'), kdfparams.n, kdfparams.r, kdfparams.p, kdfparams.dklen)
    } else if (json.crypto.kdf === 'pbkdf2') {
        kdfparams = json.crypto.kdfparams
        if (kdfparams.prf !== 'hmac-sha256') {
            throw new Error('Unsupported parameters to PBKDF2')
        }
        derivedKey = ethUtil.crypto.pbkdf2Sync(new Buffer(password), new Buffer(kdfparams.salt, 'hex'), kdfparams.c, kdfparams.dklen, 'sha256')
    } else {
        throw new Error('Unsupported key derivation scheme')
    }
    var ciphertext = new Buffer(json.crypto.ciphertext, 'hex')
    var mac = ethUtil.sha3(Buffer.concat([derivedKey.slice(16, 32), ciphertext]))
    if (mac.toString('hex') !== json.crypto.mac) {
        throw new Error('Key derivation failed - possibly wrong passphrase')
    }
    var decipher = ethUtil.crypto.createDecipheriv(json.crypto.cipher, derivedKey.slice(0, 16), new Buffer(json.crypto.cipherparams.iv, 'hex'))
    var seed = Wallet.decipherBuffer(decipher, ciphertext, 'hex')
    while (seed.length < 32) {
        var nullBuff = new Buffer([0x00]);
        seed = Buffer.concat([nullBuff, seed]);
    }
    return new Wallet(seed)
}
Wallet.prototype.toV3String = function(password, opts) {
    return JSON.stringify(this.toV3(password, opts))
}
Wallet.prototype.getV3Filename = function(timestamp) {
    var ts = timestamp ? new Date(timestamp) : new Date()
    return ['UTC--', ts.toJSON().replace(/:/g, '-'), '--', this.getAddress().toString('hex')].join('')
}
Wallet.decipherBuffer = function(decipher, data) {
    return Buffer.concat([decipher.update(data), decipher.final()])
}
Wallet.decodeCryptojsSalt = function(input) {
    var ciphertext = new Buffer(input, 'base64')
    if (ciphertext.slice(0, 8).toString() === 'Salted__') {
        return {
            salt: ciphertext.slice(8, 16),
            ciphertext: ciphertext.slice(16)
        }
    } else {
        return {
            ciphertext: ciphertext
        }
    }
}
Wallet.evp_kdf = function(data, salt, opts) {
    // A single EVP iteration, returns `D_i`, where block equlas to `D_(i-1)`

    function iter(block) {
        var hash = ethUtil.crypto.createHash(opts.digest || 'md5')
        hash.update(block)
        hash.update(data)
        hash.update(salt)
        block = hash.digest()
        for (var i = 1; i < (opts.count || 1); i++) {
            hash = ethUtil.crypto.createHash(opts.digest || 'md5')
            hash.update(block)
            block = hash.digest()
        }
        return block
    }
    var keysize = opts.keysize || 16
    var ivsize = opts.ivsize || 16
    var ret = []
    var i = 0
    while (Buffer.concat(ret).length < (keysize + ivsize)) {
        ret[i] = iter((i === 0) ? new Buffer(0) : ret[i - 1])
        i++
    }
    var tmp = Buffer.concat(ret)
    return {
        key: tmp.slice(0, keysize),
        iv: tmp.slice(keysize, keysize + ivsize)
    }
}
Wallet.walletRequirePass = function(ethjson) {
    var jsonArr;
    try {
        jsonArr = JSON.parse(ethjson);
    } catch (err) {
        throw globalFuncs.errorMsgs[3];
    }
    if (jsonArr.encseed != null) return true;
    else if (jsonArr.Crypto != null || jsonArr.crypto != null) return true
    else if (jsonArr.hash != null && jsonArr.locked) return true;
    else if (jsonArr.hash != null && !jsonArr.locked) return false;
    else if (jsonArr.publisher == "MyEtherWallet" && !jsonArr.encrypted) return false;
    else
        throw globalFuncs.errorMsgs[2];
}
Wallet.getWalletFromPrivKeyFile = function(strjson, password) {
    var jsonArr = JSON.parse(strjson);
    if (jsonArr.encseed != null) return Wallet.fromEthSale(strjson, password);
    else if (jsonArr.Crypto != null || jsonArr.crypto != null) return Wallet.fromV3(strjson, password, true);
    else if (jsonArr.hash != null) return Wallet.fromMyEtherWallet(strjson, password);
    else if (jsonArr.publisher == "MyEtherWallet") return Wallet.fromMyEtherWalletV2(strjson);
    else
        throw globalFuncs.errorMsgs[2];
}

Wallet.prototype.normalizeTxData = function (to, value, unit) {
    return {
        to,
        value,
        unit,
        data: "",
        gasLimit: 21000,
        from: this.getAddressString(),
        privKey: this.getPrivateKeyString(),
        path: this.getPath(),
        hwType: this.getHWType(),
        hwTransport: this.getHWTransport()
    }
}

Wallet.prototype.generateTx = function (to, value, unit, callback) {
    const txData = this.normalizeTxData(to, value, unit)

    function genTxWithInfo (data) {
        const rawTx = {
            nonce: etherFuncs.sanitizeHex(data.nonce),
            gasPrice: data.isOffline ? etherFuncs.sanitizeHex(data.gasprice) : etherFuncs.sanitizeHex(etherFuncs.addTinyMoreToGas(data.gasprice)),
            gasLimit: etherFuncs.sanitizeHex(etherFuncs.decimalToHex(txData.gasLimit)),
            to: etherFuncs.sanitizeHex(txData.to),
            value: etherFuncs.sanitizeHex(etherFuncs.decimalToHex(etherUnits.toWei(txData.value, txData.unit))),
            data: etherFuncs.sanitizeHex(txData.data)
        }
        const eTx = new ethUtil.Tx(rawTx);
        eTx.sign(new Buffer(txData.privKey, 'hex'));
        rawTx.rawTx = JSON.stringify(rawTx);
        rawTx.signedTx = '0x' + eTx.serialize().toString('hex');
        rawTx.isError = false;
        if (callback !== undefined) callback(rawTx);
    }

    customNode.getTransactionData(txData.from, function (data) {
        if (data.error && callback !== undefined) {
            callback({
                isError: true,
                error: e
            });
        } else {
            data = data.data;
            genTxWithInfo(data);
        }
    })
}

Wallet.prototype.sendRawTx = function (rawTx, callback) {
    return customNode.sendRawTx(rawTx, callback)
}

module.exports = Wallet;
