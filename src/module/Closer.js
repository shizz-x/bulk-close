const web3 = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const bs58 = require("bs58");

module.exports = class TokenAccountCloser {
  constructor(props) {
    this.wallets = props.privateKeys.map((key) => this.keyToAccount(key));

    this.connection = new web3.Connection(
      "https://palpable-compatible-cloud.solana-mainnet.quiknode.pro/0a2a500aafd1a4a7817d28d9a7855e1030c24b4a/",
      "confirmed"
    );

    this.web3 = web3;
  }

  signAllTrx(KP, trxs) {
    return trxs.map((trx) => trx.sign(KP));
  }

  strToPubkey(str) {
    return new web3.PublicKey(str);
  }
  keyToAccount(key) {
    try {
      return web3.Keypair.fromSecretKey(bs58.decode(key));
    } catch (e) {
      throw new Error("NON VALID PRIVATE KEY  - " + key);
    }
  }

  createBurnTransaction(publicKey, account, mint, amount, decimals) {
    return new web3.Transaction().add(
      spl.createBurnCheckedInstruction(
        account,
        mint,
        publicKey,
        amount,
        decimals,
        undefined,
        spl.TOKEN_PROGRAM_ID
      )
    );
  }

  getParsedTokenAccountsByPK(publicKey) {
    return this.connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: spl.TOKEN_PROGRAM_ID,
    });
  }

  sendRaw(trx) {
    return this.connection.sendRawTransaction(trx);
  }

  confirm(trx) {
    return this.connection.confirmTransaction(trx, "finalized");
  }

  recentBlockhash() {
    return this.connection.getLatestBlockhash();
  }

  filterParsedTokenAccounts(tokenAccounts, burn = true) {
    if (tokenAccounts) {
      if (!burn) {
        return tokenAccounts.value.filter(
          (acc) =>
            acc.account.data.parsed.info.tokenAmount.uiAmount == 0 &&
            acc.account.data.parsed.info.state !== "frozen"
        );
      } else {
        if (tokenAccounts.value.length > 0) {
          return tokenAccounts.value.filter(
            (acc) => acc.account.data.parsed.info.state !== "frozen"
          );
        }
      }
    }
    return [];
  }
  chunks(array, chunkSize = 10) {
    let res = [];
    for (
      let currentChunk = 0;
      currentChunk < array.length;
      currentChunk += chunkSize
    ) {
      res.push(array.slice(currentChunk, currentChunk + chunkSize));
    }
    return res;
  }
  generateTransactionsForKeyPair(wallet, filteredAccounts, recentBlockhash) {
    const transactions = [];

    this.chunks(filteredAccounts).forEach((chunk) => {
      // New empty transaction
      const txn = new web3.Transaction();
      txn.feePayer = wallet.publicKey;
      txn.recentBlockhash = recentBlockhash;
      for (const account of chunk) {
        // Add a `closeAccount` instruction for every token account in the chunk
        txn.add(
          spl.createCloseAccountInstruction(
            account.pubkey,
            wallet.publicKey,
            wallet.publicKey
          )
        );
      }

      transactions.push(txn);
    });
    transactions.map((trx) => trx.sign(wallet));
    return transactions;
  }

  getBalance(PK) {
    return this.connection.getBalance(PK);
  }

  transferSol(sourceWallet, destinationPublicKey, amount, blockhash) {
    // Create a new transaction
    const transaction = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: sourceWallet.publicKey,
        toPubkey: destinationPublicKey,
        lamports: amount - 5000, // Amount in lamports (1 SOL = 10^9 lamports)
      })
    );

    // Sign the transaction
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sourceWallet.publicKey;
    transaction.sign(sourceWallet);
    console.log(
      `Transferred ${amount / web3.LAMPORTS_PER_SOL} SOL from ${
        sourceWallet.publicKey
      } to ${destinationPublicKey}`
    );

    // Send and confirm the transaction
    return this.connection.sendRawTransaction(transaction.serialize());
  }
  returnWallets() {
    return this.wallets;
  }
};
