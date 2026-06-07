import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ── Watch image upload storage ─────────────────────────────
const watchStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'time-ng/watches',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit', quality: 'auto:best' },
    ],
    public_id: (req, file) => `watch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  },
});

// ── Multer with file validation ────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'), false);
  }
};

export const uploadWatchImages = multer({
  storage: watchStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 6,                   // max 6 images per watch
  },
});

export const deleteImage = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
