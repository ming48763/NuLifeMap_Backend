const mongoose = require('mongoose');

const MarkerSchema = new mongoose.Schema({
  // 共通欄位
  type: {
    type: String,
    required: true,
    enum: ['rental', 'job', 'play'] // 限制只能是這三種標籤
  },
  address: {
    type: String,
    required: true
  },
  // MongoDB 標準 GeoJSON 格式，用來精確定位與地理查詢
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // 格式為 [經度, 緯度] (Longitude, Latitude)
      required: true
    }
  },
  memo: {
    type: String,
    default: ''
  },

  // 1. 租屋專屬欄位 (當 type === 'rental' 時使用)
  rentalInfo: {
    price: Number,       // 租金
    floor: String,       // 樓層
    size: Number,        // 坪數
    amenities: [String]  // 房間設備（例如：冷氣、冰箱、洗衣機）
  },

  // 2. 工作專屬欄位 (當 type === 'job' 時使用)
  jobInfo: {
    companyName: String, // 公司名稱
    titles: [String],    // 職稱（支援多個職稱）
    salary: String,      // 薪資待遇
    workHours: String,   // 工作時間
    sourceUrl: String    // 爬蟲來源網址（例如 591 求職網）
  },

  // 3. 玩耍專屬欄位 (當 type === 'play' 時使用)
  playInfo: {
    placeName: String,   // 場域名稱
    ticketPrice: Number, // 票價
    activityInfo: String,// 活動資訊 / 官網連結資訊
    businessHours: String// 營業時間
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 為地理座標建立索引，未來可以做方圓幾公里內的快速搜尋
MarkerSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Marker', MarkerSchema);