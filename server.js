const express = require('express')
const multer = require('multer')
const admin = require('firebase-admin')

const app = express()
const PORT = process.env.PORT || 8080

// Firebase Admin init
const serviceAccount = require('./serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})
const db = admin.firestore()

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// multer memory storage for files
const upload = multer({ storage: multer.memoryStorage() })

// Get all messages
app.get('/chat', async (_, res) => {
  try {
    const snapshot = await db.collection('messages').orderBy('time', 'asc').get()
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(messages)
  } catch (e) {
    res.status(500).send('Error fetching messages')
  }
})

// Send text message
app.post('/send', async (req, res) => {
  try {
    await db.collection('messages').add({
      type: 'text',
      from: req.body.from || 'anonymous',
      content: req.body.message,
      time: admin.firestore.FieldValue.serverTimestamp()
    })
    res.sendStatus(200)
  } catch (e) {
    res.status(500).send('Error sending message')
  }
})

// Send image as base64 in Firestore
app.post('/send-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).send('No image uploaded')

  try {
    const base64 = req.file.buffer.toString('base64')
    await db.collection('messages').add({
      type: 'image',
      from: req.body.from || 'anonymous',
      content: `data:${req.file.mimetype};base64,${base64}`,
      time: admin.firestore.FieldValue.serverTimestamp()
    })
    res.redirect(`/?from=${req.body.from}`)
  } catch (e) {
    res.status(500).send('Error uploading image')
  }
})

// Send generic file as base64
app.post('/send-file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded')

  try {
    const base64 = req.file.buffer.toString('base64')
    await db.collection('messages').add({
      type: 'file',
      from: req.body.from || 'anonymous',
      content: `data:${req.file.mimetype};base64,${base64}`,
      fileName: req.body.fileName || req.file.originalname,
      fileSize: req.file.size,
      time: admin.firestore.FieldValue.serverTimestamp()
    })
    res.sendStatus(200)
  } catch (e) {
    res.status(500).send('Error uploading file')
  }
})

// Clear chat (delete all messages)
app.post('/clear-chat', async (_, res) => {
  try {
    const batch = db.batch()
    const snapshot = await db.collection('messages').get()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    res.sendStatus(200)
  } catch (e) {
    res.status(500).send('Error clearing chat')
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
