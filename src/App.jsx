import logo from "./logo.svg";
import "./App.css";
import TokenAccountCloser from "./module/Closer";
import { useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import base58 from "bs58";

window.Buffer = Buffer;
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
function App() {
  const input = useRef();
  const [closer, setCloser] = useState(undefined);
  const [text, setText] = useState("");
  const [STATUS, setStatus] = useState("Paused");
  const [minTokenAccounts, minTokenAccountsSet] = useState(1);
  const [source, setsource] = useState(
    "Put any keys to the area for see first PK"
  );
  const [burnTkns, setBurnTkns] = useState(true);
  const handleCheckboxChange = (event) => {
    if (event.target.checked) {
      setBurnTkns(true);
    } else {
      setBurnTkns(false);
    }
  };
  const handleTextareaChange = (event) => {
    console.log(BigInt("123123"));
    setText(event.target.value);
    let keys = event.target.value.split("\n").filter((line) => line.trim());
    try {
      const closer = new TokenAccountCloser({ privateKeys: keys });
      setCloser(closer);
      statusSet(`loaded ${keys.length} wallets`);
    } catch (e) {
      statusSet(e.message);
    }
  };
  const handleMinchange = (event) => {
    if (event.target.value >= 1) {
      minTokenAccountsSet(event.target.value);
    }
  };
  const statusSet = (msg) => {
    setStatus(msg);
    console.log(msg);
  };

  useEffect(() => {
    try {
      if (closer.wallets.length < 1) {
        setsource("Put any keys to the area for see first PK");
      }
      setsource(closer.wallets[0].publicKey.toString());
    } catch {}
  }, [closer]);
  const burn = async (
    closer,
    walletFrom,
    tokenAccount,
    mint,
    amount,
    decimals
  ) => {
    const burnTrx = closer.createBurnTransaction(
      walletFrom.publicKey,
      tokenAccount,
      closer.strToPubkey(mint),
      amount,
      decimals
    );

    burnTrx.recentBlockhash = (await closer.recentBlockhash()).blockhash;
    burnTrx.feePayer = walletFrom.publicKey;
    burnTrx.sign(walletFrom);

    const trxSignature = await closer.sendRaw(burnTrx.serialize());
    return closer.confirm(trxSignature);
  };
  const start = async () => {
    if (!closer) {
      statusSet("Put keys to the area");
      return 1;
    }
    if (closer.wallets.length < 1) {
      statusSet("Put keys to the area");
    }

    let sourceWallet = closer.wallets[0];
    let sourceBalance = await closer.getBalance(sourceWallet.publicKey);
    if (sourceBalance < 100000) {
      statusSet("Source wallet dont have enough funds");
      return 1;
    }

    const walletsWithFunds = await check();

    if (
      sourceWallet.publicKey.toString() !==
      walletsWithFunds[0].publicKey.toString()
    ) {
      statusSet(`Transfering ${sourceBalance} lamports from source`);
      await closer.confirm(
        await closer.transferSol(
          sourceWallet,
          walletsWithFunds[0].publicKey,
          sourceBalance,
          (
            await closer.recentBlockhash()
          ).blockhash
        )
      );
      sourceWallet = walletsWithFunds[0];
      await sleep(6000);
    } else {
      statusSet("Starting from source");
    }
    for (let i = 0; i < walletsWithFunds.length; i++) {
      const accounts = await closer.getParsedTokenAccountsByPK(
        walletsWithFunds[i].publicKey
      );
      const filtredAccounts = closer.filterParsedTokenAccounts(
        accounts,
        burnTkns
      );

      for (let j = 0; j < filtredAccounts.length; j++) {
        if (
          filtredAccounts[j].account.data.parsed.info.tokenAmount.uiAmount > 0
        ) {
          statusSet(`burning  ${filtredAccounts[j].pubkey.toString()} account`);
          // BURNING SHIT IF AMOUNT > 0
          burn(
            closer,
            walletsWithFunds[i],
            filtredAccounts[j].pubkey,
            filtredAccounts[j].account.data.parsed.info.mint,
            BigInt(
              filtredAccounts[j].account.data.parsed.info.tokenAmount.amount
            ),
            filtredAccounts[j].account.data.parsed.info.tokenAmount.decimals
          );
          await sleep(3000);
        }
      }
      statusSet(`closing accounts...`);
      await sleep(7000);

      const transactions = closer.generateTransactionsForKeyPair(
        walletsWithFunds[i],
        filtredAccounts,
        (await closer.recentBlockhash()).blockhash
      );

      const serializedTransactions = transactions.map((t) => t.serialize());

      for (var k = 0; k < serializedTransactions.length; k++) {
        closer.sendRaw(serializedTransactions[k]);

        if (k == serializedTransactions.length - 1) {
          await closer.confirm(await closer.sendRaw(serializedTransactions[k]));
        }
      }
      statusSet(`SUCCESFULLY CLOSED ${filtredAccounts.length} ACCOUNT`);

      if (i + 1 === walletsWithFunds.length) {
        console.log("done!");
        return;
      }
      await sleep(6000);
      statusSet(`tranfering sol to the next`);
      await closer.confirm(
        await closer.transferSol(
          sourceWallet,
          walletsWithFunds[i + 1].publicKey,
          await closer.getBalance(walletsWithFunds[i].publicKey),
          (
            await closer.recentBlockhash()
          ).blockhash
        )
      );
      sourceWallet = walletsWithFunds[i + 1];
      await sleep(7000);
    }
  };

  const check = async () => {
    if (!closer) {
      statusSet("Put keys to the area");
      return 1;
    }
    if (closer.wallets.length < 1) {
      statusSet("Put keys to the area");
    }
    let walletsWithFunds = [];
    let totalAccs = 0;
    let totalTok = 0;
    for (let i = 0; i < closer.wallets.length; i++) {
      const accounts = await closer.getParsedTokenAccountsByPK(
        closer.wallets[i].publicKey
      );

      const filtredAccounts = closer.filterParsedTokenAccounts(
        accounts,
        burnTkns
      );

      if (filtredAccounts.length >= minTokenAccounts) {
        totalAccs += filtredAccounts.length;

        walletsWithFunds.push(closer.wallets[i]);

        statusSet(
          `${walletsWithFunds.length} wallets has ${totalAccs} unclosed accounts, all private keys will printed in console`
        );
      }
      await sleep(300);
    } //CHECKING FOR TOKEN ACCOUNTS.
    if (walletsWithFunds.length < 1) {
      statusSet(
        "All accounts clear! (check for minimum amount of token accounts)"
      );
    } else {
      walletsWithFunds.map((wallet) =>
        console.log(base58.encode(wallet.secretKey))
      );
    }
    return walletsWithFunds;
  };

  const findBalances = async () => {
    for (let index = 0; index < closer.wallets.length; index++) {
      await sleep(400);
      let balance = await closer.getBalance(closer.wallets[index].publicKey);
      if (balance > 0) {
        statusSet(
          base58.encode(closer.wallets[index].secretKey) +
            " has " +
            balance +
            " lamports"
        );
      }
    }
  };

  return (
    <header className="App-header">
      <textarea
        ref={input}
        value={text}
        onChange={handleTextareaChange}
        name=""
        id="INPUT"
        cols="30"
        rows="10"
      ></textarea>
      <div className="controls">
        <div className="controls_column">
          <div className="flex">
            <span>minimum amount of token accounts:</span>
            <input
              value={minTokenAccounts}
              onChange={handleMinchange}
              type="number"
            />
          </div>
          <div className="flex">
            <span>burn all tokens:</span>
            <input
              defaultChecked
              onChange={handleCheckboxChange}
              type="checkbox"
            />
          </div>
          <button onClick={start}>start</button>
          <button onClick={check}>check for unclosed token accounts</button>
          <button onClick={findBalances}>check balance</button>
        </div>
      </div>
      <p>
        <b>{STATUS}</b>
      </p>
      <h1>STATUS:</h1>

      <div className="note">
        <ul style={{ textAlign: "start" }}>
          <h2>note</h2>
          <li>use at your own risk</li>
          <li>
            this application "reset" bulk wallets with reveal rented solana
          </li>
          <li>send around 0.001SOL to first private key ({source})</li>
          <li>
            you can check wallets for unclosed accounts, (minimum amount of
            token accounts works)
          </li>
          <li>all data duplicates in dev console</li>
        </ul>
      </div>
    </header>
  );
}

export default App;
