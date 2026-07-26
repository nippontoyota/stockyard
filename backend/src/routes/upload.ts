import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.post('/damage-photo', authenticate, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No photo provided' });
      return;
    }
    
    // Fallback if supabase isn't configured
    if (!process.env.SUPABASE_URL) {
      const b64 = req.file.buffer.toString('base64');
      res.json({ url: `data:${req.file.mimetype};base64,${b64}` });
      return;
    }

    const fileExt = req.file.mimetype.split('/')[1] || 'jpeg';
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
    const filePath = `damage/${fileName}`;
    
    const { data, error } = await supabase.storage
      .from('damage-photos')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });
      
    if (error) {
      console.error('Supabase upload error:', error);
      res.status(500).json({ error: 'Failed to upload photo' });
      return;
    }
    
    const { data: publicUrlData } = supabase.storage
      .from('damage-photos')
      .getPublicUrl(filePath);
      
    res.json({ url: publicUrlData.publicUrl });
  } catch (err) {
    next(err);
  }
});

export default router;
