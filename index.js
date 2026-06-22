const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Auth middleware - bảo vệ API
const SECRET = process.env.BRIDGE_SECRET || 'sap-bridge-secret';
const WP_URL = process.env.WP_URL || 'https://textureinart.com';
const WP_USER = process.env.WP_USER;
const WP_PASSWORD = process.env.WP_PASSWORD;

app.use((req, res, next) => {
  const token = req.headers['x-bridge-token'];
  if (token !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'WordPress Bridge OK', site: WP_URL });
});

// Đăng bài viết
app.post('/post', async (req, res) => {
  try {
    const { title, content, status = 'publish', categories, slug, meta_description } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title và content là bắt buộc' });
    }

    const credentials = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');

    // Tạo hoặc lấy category ID
    let categoryIds = [];
    if (categories) {
      const catResponse = await fetch(`${WP_URL}/wp-json/wp/v2/categories?search=${encodeURIComponent(categories)}`, {
        headers: { 'Authorization': `Basic ${credentials}` }
      });
      const cats = await catResponse.json();
      
      if (cats.length > 0) {
        categoryIds = [cats[0].id];
      } else {
        // Tạo category mới nếu chưa có
        const newCat = await fetch(`${WP_URL}/wp-json/wp/v2/categories`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: categories })
        });
        const catData = await newCat.json();
        categoryIds = [catData.id];
      }
    }

    // Đăng bài
    const postBody = {
      title,
      content,
      status,
      ...(slug && { slug }),
      ...(categoryIds.length > 0 && { categories: categoryIds }),
    };

    const postResponse = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postBody)
    });

    const postData = await postResponse.json();

    if (postResponse.ok) {
      res.json({
        success: true,
        post_id: postData.id,
        link: postData.link,
        title: postData.title?.rendered,
        status: postData.status
      });
    } else {
      res.status(400).json({ error: postData.message || 'Lỗi khi đăng bài', details: postData });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lấy danh sách bài viết
app.get('/posts', async (req, res) => {
  try {
    const credentials = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
    const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=10&orderby=date&order=desc&_fields=id,title,link,status,date`, {
      headers: { 'Authorization': `Basic ${credentials}` }
    });
    const posts = await response.json();
    res.json({ posts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WordPress Bridge running on port ${PORT}`);
  console.log(`Connected to: ${WP_URL}`);
});
