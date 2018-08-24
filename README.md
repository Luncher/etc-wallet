## ETC-Wallet

>Inspired By [etherwallet](https://github.com/ethereumproject/etherwallet).


## Quick Start

```javascript
const Wallet = require('etc-wallet')

const instance = new Wallet({ privKey: 'ih3ei2hriu23hiur2' })

instance.getBalance()
.then(balance => {
  console.log('balance: ', balance)
  return instance.getTransactionCount()
})
.then(count => {
  console.log('count: ', count)
  return instance.transfer('0x743rf23f23r23', 1)
})
.catch(err => {
  console.log('error: ', err)
})

```

## Action List

+ sendRawTx
+ transfer
+ transferAll
+ getBalance
+ getTransactionCount


## License MIT