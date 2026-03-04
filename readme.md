# Getting Started with Create React App

This is a demo app for betternship

## Available Scripts

In the project directory, you can run:

### `node index.js`

Runs the app in the development mode.\
Open [http://localhost:3900](http://localhost:3900) URL.

curl -i -X POST http://localhost:3900/accounts \
       -H 'Content-Type: application/json' \
       -d '{"id":"osho","balance":100}'

curl -i http://localhost:3900/accounts/osho

curl -i -X POST http://localhost:3900/orders \
       -H "Content-Type: application/json" \
       -d '{"accountId":"osho","amount":100}'

curl -i http://localhost:3900/orders

### Thank You LOve Osho...
# betternship-test
# betternship-test
# betternship-test
# betternship-test
