# RIFT 2026: Financial Forensics Engine

**A live, completely browser-based graph intelligence platform for the RIFT 2026 Money Muling Detection Challenge.**

![Live Demo](https://hackthon-delta-eight.vercel.app/)

## 🔍 Overview

The Financial Forensics Engine is designed to detect sophisticated money-laundering schemes and money-muling activities by mapping financial transactions into a complex directed graph network. It achieves sub-30-second processing for up to 10,000 transactions entirely within the user's browser, preserving data privacy and eliminating the need for backend computations.

## 🚀 Features

*   **100% Client-Side Processing**: No need to spin up backend servers; the entire graph algorithm suite runs directly in the browser.
*   **Interactive Network Visualization**: Powered by `Cytoscape.js`, the platform provides an interactive, draggable, and dynamically colored Node-Link diagram.
*   **Speaking Forensics Assistant**: A built-in AI chatbot leveraging the **Web Speech API** that can listen to your voice and talk back to answer common queries.
*   **Dynamic Merchant Avoidance**: Advanced statistical checks protect legitimate high-volume endpoints (e.g., payroll accounts) from being flagged as Smurfs.
*   **Downloadable JSON Reporting**: Outputs exact structured reporting that complies directly with RIFT 2026 formats.

## 🧠 Core Graph Algorithms

### 1. Circular Routing (Cycles)
Detects individuals moving funds in a loop to obscure origins. The engine utilizes **Depth-First Search (DFS)** to traverse the graph and identify circular paths ranging from 3 to 5 hops.

### 2. Smurfing Patterns
Smurfing occurs when large transaction sums are fractured into many micro-transactions. We analyze the **fan-in** and **fan-out** degrees of all nodes, flagging accounts that engage with 10+ counterparts within a rapid 72-hour window.

### 3. Layered Shell Chains
Identifies linear bridges of funds flowing through "burner" accounts. The engine uses limited path traversals to map 3-6 hop chains where intermediate accounts act solely as conduits, having fewer than 3 total transactions overall.

## 🏆 Scoring Methodology

Our Suspicion Score algorithm deterministically assigns a risk level between `0` and `100` per account. 

*   **Critical (≥70)**: Visualized in **Red**. Heavy involvement in multiple distinct fraud vectors. 
*   **Moderate (40–69)**: Visualized in **Yellow**. Suspect activity requiring review.
*   **Normal (0–39)**: Visualized in **Dark Blue**. Safe accounts.

An account's score increases dynamically based on its structural criticality—for example, bridging multiple fraud rings yields compounding penalties.

## 🛠️ Tech Stack
*   **Front End**: HTML5, Vanilla JavaScript (ES11+), Vanilla CSS variables.
*   **Graph Library**: `Cytoscape.js` (for interactive layouts).
*   **CSV Parsing**: `PapaParse`.
*   **Voice Interactivity**: Browser-native `speechSynthesis` and `SpeechRecognition` APIs.
*   **Deployment**: Vercel Git-integrated Deployment.

## 📥 How to Run Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/Kal9453/hackthonnoida.git
   cd hackthonnoida
   ```
2. Serve the directory using any static file server:
   ```bash
   # Using Node.js (npx)
   npx serve .
   
   # Or using Python
   python3 -m http.server
   ```
3. Open `http://localhost:3000` (or `http://localhost:8000`) in your browser.
4. Drag and drop your `.csv` dataset, or click "Load Sample Data" to see it in action!

## 📄 License & Attribution
Designed exclusively for the RIFT 2026 Hackathon pipeline. No transaction data leaves the browser context. All computations are ephemeral.
