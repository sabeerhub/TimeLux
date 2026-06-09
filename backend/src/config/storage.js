import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Use memory storage — file goes to buffer then we upload to Supabase
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type. Only JPG, PNG, WebP allowed.'), false);
};

export const uploadWatchImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
});

export const uploadToSupabase = async (file, folder = 'watches') => {
  const ext = file.originalname.split('.').pop();
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substr(2,9)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('Watches')
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('Watches')
    .getPublicUrl(filename);

  return { url: publicUrl, public_id: filename };
};

export const deleteFromSupabase = async (publicId) => {
  const { error } = await supabase.storage
    .from('Watches')
    .remove([publicId]);
  if (error) console.error('Delete error:', error.message);
};

export default supabase;
