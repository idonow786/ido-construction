const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');

const app = express();

dotenv.config();



//    Routes Importing
const customerRoute = require('./Route/customerRoute')
const amcCustomerRoute = require('./Route/amcCustomerRoute')
const expenseRoute = require('./Route/expenseRoute')
const staffRoute = require('./Route/staffRoute')
const invoiceRoute = require('./Route/invoiceRoute')
const reportRoute = require('./Route/reportRoute')
const projectRoute = require('./Route/projectRoute')
const dashboardRoute = require('./Route/dashboardRoute')
const vendorRoute = require('./Route/vendorRoute')
const taskRoute = require('./Route/taskRoute')
const supplierRoute = require('./Route/supplierRoutes')
const inventoryRoute = require('./Route/inventoryRoutes')
const adminRoute = require('./Route/adminRoute')

// Connect to MongoDB
const db = require('./Config/db');

// Middleware
app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('combined'));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }
  })
);

// Routes
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

//Routes
app.use('/api/customer', customerRoute)
app.use('/api/amc/customer', amcCustomerRoute)
app.use('/api/expense', expenseRoute)
app.use('/api/staff', staffRoute)
app.use('/api/invoice', invoiceRoute)
app.use('/api/project', projectRoute)
app.use('/api/report', reportRoute)
app.use('/api/dashboard', dashboardRoute)
app.use('/api/vendor', vendorRoute)
app.use('/api/task', taskRoute)
app.use('/api/supplier', supplierRoute)
app.use('/api/inventory', inventoryRoute)
app.use('/api/admin', adminRoute)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// Start the serverc
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
