import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function ensureBuckets() {
  if (process.env.NODE_ENV !== 'production' && supabaseUrl.includes('placeholder')) return;
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    
    const hasDamagePhotos = buckets.some(b => b.name === 'damage-photos');
    if (!hasDamagePhotos) {
      await supabase.storage.createBucket('damage-photos', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        fileSizeLimit: 5242880, // 5MB
      });
      console.log('Created Supabase storage bucket: damage-photos');
    }
  } catch (err) {
    console.error('Failed to ensure Supabase buckets:', err);
  }
}

export async function uploadBase64Image(base64Str: string): Promise<string | null> {
  if (!base64Str.startsWith('data:image/')) return base64Str; // already a URL or invalid

  if (process.env.NODE_ENV !== 'production' && supabaseUrl.includes('placeholder')) {
    return base64Str; // fallback for local dev
  }

  try {
    const matches = base64Str.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64Str;

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    const fileExt = mimeType.split('/')[1] || 'jpeg';
    const fileName = `damage/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('damage-photos')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error for base64:', error);
      return base64Str; // return original if failed
    }

    const { data: publicUrlData } = supabase.storage
      .from('damage-photos')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('Base64 upload failed:', err);
    return base64Str;
  }
}
