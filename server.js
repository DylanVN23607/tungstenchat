const express = require('express')
const multer = require('multer')
const admin = require('firebase-admin')
const path = require('path')
const app = express()
const PORT = process.env.PORT || 8080

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})
const db = admin.firestore()

// Middleware setup - removed duplicate lines
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use('/', express.static(path.join(__dirname, 'public')))

// Multer setup with file size limit and error handling
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB limit
  },
  fileFilter: (req, file, cb) => {
    // Add file type validation if needed
    cb(null, true)
  }
})

// Get all messages
app.get('/chat', async (req, res) => {
  try {
    const snapshot = await db.collection('messages').orderBy('time', 'asc').get()
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(messages)
  } catch (e) {
    console.error('Error fetching messages:', e)
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
    console.error('Error sending message:', e)
    res.status(500).send('Error sending message')
  }
})

// Send image with better error handling
app.post('/send-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' })
    }
    
    console.log('Received image:', req.file.originalname, req.file.size, 'bytes')
    
    const base64 = req.file.buffer.toString('base64')
    await db.collection('messages').add({
      type: 'image',
      from: req.body.from || 'anonymous',
      content: `data:${req.file.mimetype};base64,${base64}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      time: admin.firestore.FieldValue.serverTimestamp()
    })
    
    // Return JSON response instead of redirect for better API consistency
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.json({ success: true, message: 'Image uploaded successfully' })
    } else {
      res.redirect(`/?from=${encodeURIComponent(req.body.from || 'anonymous')}`)
    }
  } catch (e) {
    console.error('Error uploading image:', e)
    res.status(500).json({ error: `Error uploading image: ${e.message}` })
  }
})

// Send generic file with improved error handling
app.post('/send-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }
    
    console.log('Received file:', req.file.originalname, req.file.size, 'bytes')
    
    const base64 = req.file.buffer.toString('base64')
    await db.collection('messages').add({
      type: 'file',
      from: req.body.from || 'anonymous',
      content: `data:${req.file.mimetype};base64,${base64}`,
      fileName: req.body.fileName || req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      time: admin.firestore.FieldValue.serverTimestamp()
    })
    
    res.json({ success: true, message: 'File uploaded successfully' })
  } catch (e) {
    console.error('Error uploading file:', e)
    res.status(500).json({ error: `Error uploading file: ${e.message}` })
  }
})

// Clear chat (delete all messages)
app.post('/clear-chat', async (req, res) => {
  try {
    const batch = db.batch()
    const snapshot = await db.collection('messages').get()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    res.json({ success: true, message: 'Chat cleared successfully' })
  } catch (e) {
    console.error('Error clearing chat:', e)
    res.status(500).json({ error: 'Error clearing chat' })
  }
})

// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' })
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` })
  }
  next(error)
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
