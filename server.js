const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const port = 3001;

// Default configuration for discount and tax rates
const DEFAULT_DISCOUNT = 0;
const DEFAULT_TAX_RATE = 0.10;

app.use(bodyParser.json());
app.use(cors());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

let db;
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'restaurant';

MongoClient.connect(url)
  .then(client => {
    console.log('Connected to Database');
    db = client.db(dbName);

    // Initialize collections and settings
    const menuItemsCollection = db.collection('menuItems');
    const settingsCollection = db.collection('settings');

    // Insert default menu items if they don't exist
    return menuItemsCollection.countDocuments()
      .then(count => {
        if (count === 0) {
          return menuItemsCollection.insertMany([
            // Default menu items
            { id: 1, name: 'Paneer Butter Masala', price: 150, category: 'vegetarian', imageUrl: '/images/paneerbutter.png' },
            { id: 2, name: 'Chicken Tikka Masala', price: 200, category: 'non-vegetarian', imageUrl: '/images/chickentikka.png' },
            // Add more items as needed
          ]);
        }
      })
      .then(() => {
        // Initialize default settings if they don't exist
        return settingsCollection.countDocuments()
          .then(count => {
            if (count === 0) {
              return settingsCollection.insertOne({
                discountRate: DEFAULT_DISCOUNT,
                taxRate: DEFAULT_TAX_RATE
              });
            }
          });
      });
  })
  .catch(error => console.error('Failed to connect to the database:', error));

// Get all menu items
app.get('/api/menu', (req, res) => {
  const menuItemsCollection = db.collection('menuItems');
  menuItemsCollection.find().toArray()
    .then(items => res.json(items))
    .catch(error => {
      console.error('Error fetching menu items:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Add a new menu item
app.post('/api/menu', (req, res) => {
  const { name, price, category, imageUrl } = req.body;
  if (!name || price == null || !category || !imageUrl) {
    res.status(400).send({ message: 'Invalid menu item data' });
    return;
  }

  const menuItemsCollection = db.collection('menuItems');
  const newItem = { name, price, category, imageUrl };
  menuItemsCollection.insertOne(newItem)
    .then(result => res.send({ message: 'Menu item added successfully', item: result.ops[0] }))
    .catch(error => {
      console.error('Error adding menu item:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Edit a menu item
app.put('/api/menu/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, price, category, imageUrl } = req.body;

  const menuItemsCollection = db.collection('menuItems');
  menuItemsCollection.updateOne(
    { id },
    { $set: { name, price, category, imageUrl } }
  )
    .then(result => res.send({ message: 'Menu item updated successfully' }))
    .catch(error => {
      console.error('Error updating menu item:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Delete a menu item
app.delete('/api/menu/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const menuItemsCollection = db.collection('menuItems');
  menuItemsCollection.deleteOne({ id })
    .then(result => res.send({ message: 'Menu item deleted successfully' }))
    .catch(error => {
      console.error('Error deleting menu item:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Get current discount and tax rates
app.get('/api/settings', (req, res) => {
  const settingsCollection = db.collection('settings');
  settingsCollection.findOne()
    .then(settings => res.json(settings))
    .catch(error => {
      console.error('Error fetching settings:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Update discount rate
app.put('/api/settings/discount', (req, res) => {
  const { discount } = req.body;
  if (discount == null || discount < 0 || discount > 100) {
    res.status(400).send({ message: 'Invalid discount rate' });
    return;
  }

  const settingsCollection = db.collection('settings');
  settingsCollection.updateOne(
    {},
    { $set: { discountRate: discount } }
  )
    .then(() => res.send({ message: 'Discount rate updated successfully', discount: discount }))
    .catch(error => {
      console.error('Error updating discount rate:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Update tax rate
app.put('/api/settings/tax', (req, res) => {
  const { tax } = req.body;
  if (tax == null || tax < 0) {
    res.status(400).send({ message: 'Invalid tax rate' });
    return;
  }

  const settingsCollection = db.collection('settings');
  settingsCollection.updateOne(
    {},
    { $set: { taxRate: tax } }
  )
    .then(() => res.send({ message: 'Tax rate updated successfully', tax: tax }))
    .catch(error => {
      console.error('Error updating tax rate:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Get all orders
app.get('/api/orders', (req, res) => {
  const ordersCollection = db.collection('orders');
  ordersCollection.find().toArray()
    .then(orders => res.json(orders))
    .catch(error => {
      console.error('Error fetching orders:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

// Add a new order
app.post('/api/orders', (req, res) => {
  const { tableNumber, items, discount } = req.body;

  if (!tableNumber || !items || !Array.isArray(items)) {
    res.status(400).send({ message: 'Invalid order: Table number and items are required' });
    return;
  }

  const menuItemsCollection = db.collection('menuItems');
  menuItemsCollection.find({ id: { $in: items.map(item => item.id) } }).toArray()
    .then(menuItems => {
      const menuItemsMap = menuItems.reduce((map, item) => {
        map[item.id] = item;
        return map;
      }, {});

      const orderWithPrices = items.map(item => {
        const menuItem = menuItemsMap[item.id];
        if (menuItem) {
          return { ...item, price: menuItem.price, imageUrl: menuItem.imageUrl };
        }
        return null;
      }).filter(item => item !== null);

      if (orderWithPrices.length !== items.length) {
        res.status(400).send({ message: 'Invalid order: Some items do not exist in the menu' });
        return;
      }

      // Get current discount and tax rates
      const settingsCollection = db.collection('settings');
      return settingsCollection.findOne()
        .then(settings => {
          const discountRate = discount != null ? discount : settings.discountRate;
          const taxRate = settings.taxRate;

          // Calculate total, discount, tax, and final amount
          const total = orderWithPrices.reduce((sum, item) => sum + item.price, 0);
          const discountAmount = (total * discountRate) / 100;
          const taxableAmount = total - discountAmount;
          const taxAmount = taxableAmount * taxRate;
          const netPayable = taxableAmount + taxAmount;
          const dateTime = new Date().toLocaleString();

          const order = {
            tableNumber,
            items: orderWithPrices,
            total,
            discount: discountAmount,
            tax: taxAmount,
            netPayable,
            dateTime,
          };

          const ordersCollection = db.collection('orders');
          return ordersCollection.insertOne(order)
            .then(result => {
              console.log('Order saved:', result.ops[0]);
              res.send({
                message: 'Order received successfully',
                total,
                discount: discountAmount,
                tax: taxAmount,
                netPayable,
                dateTime,
              });
            });
        });
    })
    .catch(error => {
      console.error('Error processing order:', error);
      res.status(500).send({ message: 'Internal Server Error' });
    });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
