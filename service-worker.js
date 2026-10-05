// 定义缓存名称和版本
const CACHE_NAME = 'money-tracker-v3';

// 需要缓存的资源列表
const RESOURCES_TO_CACHE = [
  './',
  './index8.html',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js'
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: 安装中');
  
  // 等待直到缓存完成
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('Service Worker: 缓存资源');
        for (const url of RESOURCES_TO_CACHE) {
          try { await cache.add(url); } catch (e) { console.warn('SW: 缓存失败', url, e); }
        }
      })
      .then(() => self.skipWaiting()) // 强制新的 Service Worker 立即激活
  );
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: 激活中');
  
  // 清理旧版本的缓存
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 删除旧缓存', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // 控制未控制的客户端
  );
});

// 处理获取请求
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  const accept = event.request.headers.get('accept') || '';
  const isHTML = event.request.mode === 'navigate' || accept.includes('text/html');

  if (isHTML) {
    // HTML 文档：网络优先，每次都拿最新的 index8.html；只有离线才回退缓存
    // （旧版用缓存优先，导致上传新代码后浏览器一直跑旧版）
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('./index8.html')))
    );
    return;
  }

  // 其它静态资源（CDN 库等）：缓存优先，省流量
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request));
    })
  );
});

// 处理后台同步
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords());
  }
});

// 同步记录数据
async function syncRecords() {
  try {
    const clients = await self.clients.matchAll();
    
    // 通知所有客户端进行数据同步
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_RECORDS'
      });
    });
    
    console.log('Service Worker: 同步记录数据');
  } catch (error) {
    console.error('Service Worker: 同步记录数据失败', error);
  }
}

// 处理推送通知
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || '有新的通知',
      icon: 'https://p26-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/ad7c2b837a214ce186c73655405a4df2~tplv-a9rns2rl98-image.image?lk3s=8e244e95&rcl=202605191113258BFEC36FBD385C35A573&rrcfp=f06b921b&x-expires=1781752551&x-signature=KUSTdAB0z5R8bl5oPXV4Yc7Poxo%3D',
      badge: 'https://p26-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/ad7c2b837a214ce186c73655405a4df2~tplv-a9rns2rl98-image.image?lk3s=8e244e95&rcl=202605191113258BFEC36FBD385C35A573&rrcfp=f06b921b&x-expires=1781752551&x-signature=KUSTdAB0z5R8bl5oPXV4Yc7Poxo%3D',
      data: {
        url: data.url || '/index8.html'
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(
        data.title || '简易记账',
        options
      )
    );
  } catch (error) {
    console.error('Service Worker: 处理推送通知失败', error);
  }
});

// 处理通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data.url;
      
      // 如果已经有打开的窗口，则聚焦到该窗口
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // 否则打开新窗口
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});