require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); 

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// 🌟 1. 定義三位初始使用者的白名單陣列
const USERS = [
  { account: 'mapper', password: 'bitmap', name: '地圖大師', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mapper' },
  { account: 'jobLess01', password: 'hireme01', name: '求職小菜鳥', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jobLess01' },
  { account: 'bigG', password: 'love0408', name: '大G哥', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bigG' }
];

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NuLifeMapDB')
  .then(() => console.log('✅ 成功連線至 MongoDB'))
  .catch(err => console.error('❌ MongoDB 連線失敗:', err));

// 🌟 2. Schema 新增 userId 欄位以追蹤擁有者
const markerSchema = new mongoose.Schema({
  userId: { type: String, required: false }, // 誰建立的？
  type: { type: String, required: true }, // 'job', 'housing', 'custom'
  address: String,
  lat: Number,
  lng: Number,
  memo: String,
  jobInfo: { type: Object, required: false },
  houseInfo: { type: Object, required: false },
  customInfo: { type: Object, required: false },
  createdAt: { type: Date, default: Date.now }
});
const Marker = mongoose.model('Marker', markerSchema);

// ==========================================
// API 路由區域
// ==========================================

// 🌟 新增：登入驗證 API
app.post('/api/login', (req, res) => {
  const { account, password } = req.body;
  const user = USERS.find(u => u.account === account && u.password === password);
  
  if (user) {
    // 為了安全，回傳給前端時剔除密碼
    const { password, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } else {
    res.status(401).json({ success: false, error: '帳號或密碼錯誤' });
  }
});

// 🌟 新增：一次性使用的資料庫「欄位排序」API (解決強迫症的完美排序)
app.get('/api/reorder-fields', async (req, res) => {
  try {
    // 拿取純資料物件
    const markers = await Marker.find({}).lean();
    let count = 0;
    
    for (let doc of markers) {
      // 1. 建立一個全新、順序完美的物件 (把 userId 排在最前面)
      const orderedDoc = {
        userId: doc.userId,
        type: doc.type,
        address: doc.address,
        lat: doc.lat,
        lng: doc.lng,
        memo: doc.memo
      };
      
      // 根據不同類型加入專屬資訊
      if (doc.houseInfo) orderedDoc.houseInfo = doc.houseInfo;
      if (doc.jobInfo) orderedDoc.jobInfo = doc.jobInfo;
      if (doc.customInfo) orderedDoc.customInfo = doc.customInfo;
      
      orderedDoc.createdAt = doc.createdAt;

      // 2. 將舊資料完全覆蓋為排序好的新資料 (MongoDB 會嚴格按照物件定義的順序寫入)
      await Marker.replaceOne({ _id: doc._id }, orderedDoc);
      count++;
    }
    
    res.json({
      success: true,
      message: `🎉 成功重新排列了 ${count} 筆資料的欄位順序！請重整 MongoDB Compass 查看。`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🌟 修改：獲取標記，根據 userId 過濾資料
app.get('/api/markers', async (req, res) => {
  try {
    const { userId } = req.query;
    let query = {};
    
    // 邏輯：mapper 繼承所有以前沒有 userId 的舊資料
    if (userId === 'mapper') {
      query = { $or: [{ userId: 'mapper' }, { userId: { $exists: false } }] };
    } else if (userId) {
      query = { userId: userId };
    }

    const markers = await Marker.find(query).sort({ createdAt: -1 });
    res.json(markers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🌟 新增：Python 爬蟲寫入資料專用 API
// Python 爬完資料後會打這個 POST 請求把資料寫入資料庫
app.post('/api/markers', async (req, res) => {
  try {
    const newMarker = new Marker(req.body);
    await newMarker.save();
    res.status(201).json({ success: true, marker: newMarker });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🌟 修改：接收前端網址，轉發給 Python 爬蟲 (並帶上 userId)
app.post('/api/scrape', async (req, res) => {
  const { url, userId } = req.body;
  if (!url) return res.status(400).json({ error: "請提供網址" });

  try {
    console.log(`轉發爬蟲請求: ${url} (使用者: ${userId})`);
    
    // 判斷要呼叫 Python 的哪個爬蟲端點
    let endpoint = url.includes('591.com.tw') ? '/scrape/591' : '/scrape/url';
    
    //  以環境變數讀取爬蟲環境
    const scraperBaseUrl = process.env.SCRAPER_BASE_URL || 'http://127.0.0.1:8000';

    // 注意：把 userId 一併丟給 Python 處理
    const response = await axios.post(`http://127.0.0.1:8000${endpoint}`, { 
      url: url,
      user_id: userId || 'mapper'
    });
    
    res.json({ success: true, message: "爬蟲任務完成", data: response.data });
  } catch (error) {
    console.error("爬蟲請求失敗:", error.message);
    res.status(500).json({ error: "爬蟲微服務發生錯誤或無法連線" });
  }
});

// 🌟 修改：新增自訂地點，寫入專屬 userId
app.post('/api/markers/custom', async (req, res) => {
  const { title, address, memo, userId } = req.body;
  if (!title || !address) return res.status(400).json({ error: "標題與地址為必填欄位" });

  try {
    const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: address, key: GOOGLE_API_KEY }
    });

    if (geoResponse.data.status !== 'OK') {
      throw new Error(`無法解析該地址 (${geoResponse.data.status})`);
    }

    const location = geoResponse.data.results[0].geometry.location;

    const newMarker = new Marker({
      userId: userId || 'mapper', // 沒傳就當 mapper
      type: 'custom',
      address: address,
      lat: location.lat,
      lng: location.lng,
      memo: memo || '',
      customInfo: { title: title }
    });

    await newMarker.save();
    res.json({ success: true, message: "自訂地點已成功新增", data: newMarker });
  } catch (error) {
    console.error("新增自訂地點失敗:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Node.js 伺服器已啟動於 Port ${PORT}`));