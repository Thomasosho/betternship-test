const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = 3900;
app.use(express.json());

/**
 * ARCHITECTURE OVERVIEW:
 * 
 * Accounts Service → Manages account creation and retrieval
 * Orders Service → Manages order creation and listing
 * Events Service → Emits events to eventLog
 * 
 * Data Flow:
 * 1. Client sends request → Express middleware parses JSON
 * 2. Endpoint handler validates & processes request
 * 3. Updates in-memory storage (accounts/orders objects)
 * 4. Emits events to eventLog
 * 5. Returns response to client
 */

// In-memory data store for users (Accounts Service)
let accounts = {};

// In-memory data store for orders (Orders Service)
let orders = {};

// Event log for tracking all operations (Events Service)
let eventLog = [];

/**
 * ACCOUNTS SERVICE - Create Account
 * Method: POST
 * URL: /accounts
 * Input Payload: {"id": string, "balance": number}
 * Output Expected: {"id": string, "balance": number}
 * Error Resp: { 400: "invalid payload", 500: "internal server error" }
 * 
 * Validation:
 * - id must be provided
 * - balance must be > 0
 */
app.post('/accounts', (req, res) => {
    try {
        const {id, balance} = req.body;
        
        // Validate input payload
        if (!id || balance === undefined || balance <= 0) {
            return res.status(400).send({error: 'Invalid Payload'});
        }
        
        // Store account in memory
        accounts[id] = {balance};
        
        // Emit account creation event
        eventLog.push({
            timestamp: new Date().toISOString(),
            event: 'account_created',
            id,
            balance
        });
        
        res.send({id, balance});
    } catch (error) {
        res.status(500).send({error: 'Internal server error'});
    }
});

/**
 * ACCOUNTS SERVICE - Get Account Details
 * Method: GET
 * URL: /accounts/{id}
 * Output Expected: {"id": string, "balance": number}
 * Error Resp: { 404: "account not found", 500: "internal server error" }
 */
app.get('/accounts/:id', (req, res) => {
    try {
        const {id} = req.params;
        
        // Check if account exists
        if (!accounts[id]) {
            return res.status(404).send({error: 'Account not found'});
        }
        
        res.send({id, balance: accounts[id].balance});
    } catch (error) {
        res.status(500).send({error: 'Internal server error'});
    }
});

/**
 * ORDERS SERVICE - Create Payment Order
 * Method: POST
 * URL: /orders
 * Input Payload: {"accountId": string, "amount": number}
 * Output Expected: {"orderId": string, "status": string}
 * Error Resp: { 400: "invalid payload", 404: "account not found", 402: "insufficient balance", 500: "internal server error"}
 * 
 * CONCURRENCY & ATOMICITY EXPLANATION:
 * In production, we'd use database transactions or message queues for true atomicity.
 * In this Node.js single-threaded model:
 * - JavaScript event loop processes requests sequentially within a single thread
 * - Balance check and deduction happen in one synchronous block (cannot be interrupted)
 * - Two simultaneous requests cannot execute concurrently at the same millisecond
 * - If truly distributed, we'd use: DB transactions, version numbers, or optimistic locking
 * 
 * For this implementation, the synchronous balance check & deduction is atomic
 * because JavaScript executes single-threaded and doesn't yield between the check
 * and update operations.
 */
app.post('/orders', (req, res) => {
    try {
        const {accountId, amount} = req.body;
        
        // STEP 1: Validate input payload
        if (!accountId || amount === undefined || amount <= 0) {
            eventLog.push({
                timestamp: new Date().toISOString(),
                event: 'order_creation_failed',
                reason: 'invalid_payload',
                accountId
            });
            return res.status(400).send({error: 'Invalid Payload'});
        }
        
        // STEP 2: Verify account exists
        if (!accounts[accountId]) {
            eventLog.push({
                timestamp: new Date().toISOString(),
                event: 'order_creation_failed',
                reason: 'account_not_found',
                accountId
            });
            return res.status(404).send({error: 'Account not found'});
        }
        
        // STEP 3: Check balance (ATOMIC OPERATION)
        // In this single-threaded Node.js context, the following operations
        // execute atomically without interruption:
        if (accounts[accountId].balance < amount) {
            eventLog.push({
                timestamp: new Date().toISOString(),
                event: 'order_creation_failed',
                reason: 'insufficient_balance',
                accountId,
                requestedAmount: amount,
                availableBalance: accounts[accountId].balance
            });
            return res.status(402).send({error: 'Insufficient balance'});
        }
        
        // STEP 4: Create order with UUID and deduct balance (ATOMIC)
        const orderId = uuidv4();
        
        // Deduct balance atomically
        accounts[accountId].balance -= amount;
        
        // Store order
        orders[orderId] = {
            accountId,
            amount,
            status: 'COMPLETED',
            createdAt: new Date().toISOString()
        };
        
        // STEP 5: Emit events
        eventLog.push({
            timestamp: new Date().toISOString(),
            event: 'order_created',
            orderId,
            accountId,
            amount,
            status: 'COMPLETED'
        });
        
        eventLog.push({
            timestamp: new Date().toISOString(),
            event: 'balance_updated',
            accountId,
            previousBalance: accounts[accountId].balance + amount,
            newBalance: accounts[accountId].balance,
            amountDeducted: amount
        });
        
        res.send({orderId, status: 'COMPLETED'});
    } catch (error) {
        eventLog.push({
            timestamp: new Date().toISOString(),
            event: 'order_creation_error',
            error: error.message
        });
        res.status(500).send({error: 'Internal server error'});
    }
});

/**
 * ORDERS SERVICE - List Orders
 * Method: GET
 * URL: /orders
 * Output Expected: [{"orderId": string, "status": string}]
 * Error Resp: { 500: "internal server error" }
 */
app.get('/orders', (req, res) => {
    try {
        const orderList = Object.entries(orders).map(([orderId, order]) => ({
            orderId,
            status: order.status,
            amount: order.amount,
            accountId: order.accountId
        }));
        res.send(orderList);
    } catch (error) {
        res.status(500).send({error: 'Internal server error'});
    }
});

/**
 * DEBUG ENDPOINT - Get Event Log
 * Useful for seeing emitted events in development
 */
app.get('/events', (req, res) => {
    res.send(eventLog);
});

app.listen(PORT, () => {
    console.log(`✅ Payments Microservice running on http://localhost:${PORT}`);
    console.log(`📡 Available endpoints:`);
    console.log(`   POST   /accounts        - Create account`);
    console.log(`   GET    /accounts/:id    - Get account details`);
    console.log(`   POST   /orders          - Create payment order`);
    console.log(`   GET    /orders          - List orders`);
    console.log(`   GET    /events          - View event log (debug)`);
});