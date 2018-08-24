const MyEtherWallet = require('./src/myetherwallet')

class ETCWallet {
  constructor ({ privKey }) {
    this.coinTag = 'ETC'
    this.wallet = new MyEtherWallet(privKey)
  }

  sendRawTx (txData) {
    return new Promise((resolve, reject) => {
      this.wallet.sendRawTx(txData.signedTx, function (data) {
        if (data.error) return reject(new Error(data.msg))
        resolve(data)
      })
    })
  }

  transfer (address, value) {
    const self = this
    return new Promise((resolve, reject) => {
      this.wallet.generateTx(address, value, 'ether', function (txData) {
        if (txData.isError) {
          return reject(txData.error)
        }
        return resolve(self.sendRawTx(txData))
      })
    })
  }

  async transferAll (address) {
    const balance = await this.getBalance(address)
    return this.transfer(address, balance)
  }

  getBalance () {
    return new Promise((resolve, reject) => {
      this.wallet.getBalance(function (err, balance) {
        if (err) return reject(err)
        resolve(balance)
      })
    })
  }

  getTransactionCount () {
    return new Promise((resolve, reject) => {
      this.wallet.getTransactionCount(function (err, result) {
        if (err) return reject(err)
        resolve(result)
      })
    })
  }
}

module.exports = ETCWallet