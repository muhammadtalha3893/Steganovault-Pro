<div align="center">

# 🔐 SteganoVault Pro

### Premium client-side steganography suite — hide and extract encrypted secrets inside images

[![Live Demo](https://img.shields.io/badge/Live-Demo-00c853?style=for-the-badge&logo=vercel&logoColor=white)](https://rayb4y-6f0isy1dz-arcedawebapps1.vercel.app/)
[![Encryption](https://img.shields.io/badge/Encryption-AES--256--GCM-blueviolet?style=for-the-badge)](#-security-model)
[![Technique](https://img.shields.io/badge/Technique-LSB%20Steganography-orange?style=for-the-badge)](#-how-it-works)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-success?style=for-the-badge)](#-privacy-first-by-design)
[![Hosted on Vercel](https://img.shields.io/badge/Hosted%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)

**[🚀 Launch the App](https://rayb4y-6f0isy1dz-arcedawebapps1.vercel.app/)** · **[🐛 Report a Bug](https://github.com/muhammadtalha3893/Steganovault-Pro/issues)** · **[💡 Request a Feature](https://github.com/muhammadtalha3893/Steganovault-Pro/issues)**

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Privacy First by Design](#-privacy-first-by-design)
- [How It Works](#-how-it-works)
- [Security Model](#-security-model)
- [Getting Started](#-getting-started)
- [Usage Guide](#-usage-guide)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Deployment](#-deployment)
- [Best Practices & Limitations](#-best-practices--limitations)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Author](#-author)
- [Disclaimer](#-disclaimer)

---

## 🌟 Overview

**SteganoVault Pro** is a browser-based steganography suite that lets you conceal secret messages inside ordinary images using **Least Significant Bit (LSB)** embedding, protected with **AES-256-GCM** encryption.

Every operation runs **entirely in your browser**. Your images, messages, and passwords are never uploaded to any server, which makes SteganoVault Pro suitable for privacy-conscious users, security students, and CTF enthusiasts.

> **In one line:** encrypt your secret, hide it in the pixels, share an image that looks completely normal.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🖼️ **LSB Image Steganography** | Embeds data in the least significant bits of pixel channels, producing changes that are imperceptible to the human eye. |
| 🔒 **AES-256-GCM Encryption** | Authenticated encryption protects confidentiality *and* integrity of the hidden payload. |
| 🕵️ **Hide & Extract** | A complete workflow for both embedding and recovering secrets. |
| 🌐 **100% Client-Side** | No backend, no uploads, no tracking of your data. |
| ⚡ **Fast & Lightweight** | Runs in the browser using native Web APIs. |
| 🎨 **Premium UI** | Clean, modern, responsive interface. |
| 📱 **Cross-Device** | Works on modern desktop and mobile browsers. |

---

## 🛡️ Privacy First by Design

- ✅ **No uploads**: files are processed locally in browser memory.
- ✅ **No accounts**: no sign-up, no login.
- ✅ **No server-side storage**: nothing to leak because nothing is stored.
- ✅ **Open and auditable**: review exactly what the code does.

---

## ⚙️ How It Works

```
┌──────────────┐   ┌───────────────────┐   ┌────────────────┐   ┌─────────────────┐
│ Secret text  │──▶│ AES-256-GCM       │──▶│ LSB embedding  │──▶│ Stego image     │
│ + password   │   │ encryption        │   │ into pixels    │   │ (looks normal)  │
└──────────────┘   └───────────────────┘   └────────────────┘   └─────────────────┘
```

**Hiding a message**

1. The user provides a cover image, a secret message, and a password.
2. A cryptographic key is derived from the password.
3. The message is encrypted with **AES-256-GCM**.
4. The ciphertext is written into the **least significant bits** of the image's pixel data.
5. The result is exported as a new image that is visually identical to the original.

**Extracting a message**

1. The user loads the stego image and enters the password.
2. Embedded bits are read back from the pixel data.
3. The payload is decrypted and authenticated. A wrong password or tampered data fails verification.

### Why LSB?

Changing the least significant bit of a color channel shifts its value by at most 1 out of 255, which is far below what the eye can perceive. Combined with encryption, the hidden data is both **invisible** and **unreadable** without the key.

---

## 🔐 Security Model

| Layer | Purpose |
|---|---|
| **Steganography (LSB)** | Conceals the *existence* of the message. |
| **AES-256-GCM** | Conceals the *content* and detects tampering. |
| **Password-derived key** | Only the password holder can decrypt. |
| **Client-side execution** | Secrets never leave your device. |

> ⚠️ Security depends on **password strength**. Use a long, unique passphrase.

---

## 🚀 Getting Started

### Option 1: Use the live app

👉 **https://rayb4y-6f0isy1dz-arcedawebapps1.vercel.app/**

No installation required.

### Option 2: Run locally

```bash
# 1. Clone the repository
git clone https://github.com/muhammadtalha3893/Steganovault-Pro.git

# 2. Move into the project
cd Steganovault-Pro

# 3. Serve the project with any static server, for example:
npx serve .
# or
python -m http.server 8000
```

Then open `http://localhost:8000` (or the URL printed by your server).

> If the project uses a build tool such as Vite, run `npm install` followed by `npm run dev` instead.

---

## 📘 Usage Guide

### 🔏 Hide a secret

1. Open the **Hide** tab.
2. Upload a **cover image** (PNG recommended).
3. Type your **secret message**.
4. Enter a **strong password**.
5. Click **Encode / Hide** and download the resulting stego image.

### 🔓 Extract a secret

1. Open the **Extract** tab.
2. Upload the **stego image**.
3. Enter the **same password**.
4. Click **Decode / Extract** to reveal the message.

---

## 📂 Project Structure

```
Steganovault-Pro/
├── index.html        # Application entry point and UI
├── assets/           # Styles, scripts, and static resources
├── README.md         # Project documentation
└── LICENSE           # License information
```

> Update this tree to match your actual repository layout.

---

## 🧰 Tech Stack

| Category | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript |
| **Cryptography** | Web Crypto API (AES-256-GCM) |
| **Image Processing** | HTML5 Canvas API |
| **Hosting** | Vercel |

---

## ☁️ Deployment

SteganoVault Pro is a static web app and deploys easily to Vercel, Netlify, or GitHub Pages.

**Deploy with Vercel**

```bash
npm i -g vercel
vercel
```

---

## ⚠️ Best Practices & Limitations

- **Use lossless formats (PNG).** Lossy compression such as JPEG destroys LSB data.
- **Do not resize, crop, or re-compress** the stego image, or the hidden data will be lost.
- **Capacity is limited** by image size: larger images hold more data.
- **Social platforms** often re-compress images, which can corrupt the payload. Share the file directly instead.
- **Steganography is not a substitute** for strong operational security.

---

## 🗺️ Roadmap

- [ ] Support for additional carrier types (audio, video)
- [ ] Hide files, not just text
- [ ] Randomized bit-distribution (password-seeded) embedding
- [ ] Capacity indicator and image comparison view
- [ ] Drag-and-drop and batch processing
- [ ] Progressive Web App (offline support)
- [ ] Dark / light theme toggle

---

## 🤝 Contributing

Contributions are welcome!

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m "Add amazing feature"`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

Please open an issue first to discuss any major changes.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

---

## 👤 Author

**Muhammad Talha**

- GitHub: [@muhammadtalha3893](https://github.com/muhammadtalha3893)
- Project: [Steganovault-Pro](https://github.com/muhammadtalha3893/Steganovault-Pro)

---

## ⚖️ Disclaimer

SteganoVault Pro is intended for **educational and lawful privacy purposes only**. The author is not responsible for misuse of this software. Always comply with the laws and regulations in your jurisdiction.

---

<div align="center">

⭐ **If you find this project useful, please give it a star!** ⭐

Made with ❤️ by Muhammad Talha

</div>
