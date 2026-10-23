# HifeDB - Cloud Database System

## 1. Gioi thieu
HifeDB la ung dung quan ly va thao tac co so du lieu,
su dung React + Vite cho frontend, Node.js + Express cho backend
va MongoDB Atlas cho co so du lieu cloud.

## 2. Yeu cau
- Node.js va npm
- Tai khoan MongoDB Atlas
- OpenAI API key neu su dung AI Query

## 3. Cai dat backend
Mo terminal tai thu muc backend:

    cd backend
    npm install

Sao chep .env.example thanh .env, sau do dien cac gia tri
MongoDB Atlas va OpenAI API key cua ban.

Khoi dong backend:

    npm start

Mac dinh backend su dung cong 3001.

## 4. Chay frontend khi phat trien
Mo terminal moi tai thu muc frontend:

    cd frontend
    npm install
    npm run dev

## 5. Xem ban frontend production da build
Neu chi muon xem ban build co san:

    cd frontend
    npm install
    npm run preview

Vite se hien thi dia chi truy cap tren terminal.

## 6. Luu y
- Khong chia se file .env co chua thong tin bi mat.
- Frontend production can duoc cau hinh dung dia chi backend.
- Vite Preview phuc vu kiem tra ban build, khong phai web server
  production chuyen dung.
- Can kiem tra cac chuc nang ket noi backend truoc khi ban giao.
