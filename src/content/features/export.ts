/**
 * Export feature -- save conversations as Markdown, JSON, PDF, or Text.
 *
 * Includes:
 *   - All 28 PDF style templates + common style
 *   - getPDFStyle() helper
 *   - Save as PDF (opens in new window with style picker + print)
 *   - Export modal with format selection (MD/JSON/Text)
 *   - Batch export with progress bar
 *   - Date-range filtering, selected-messages mode
 *   - Copy-to-clipboard
 *   - Splitter chain for long conversations
 *   - Copy/export helpers (saveResponseAsPDF, handleCopyText, handleCopyHtml)
 *
 * Original source: content.isolated.end.js
 *   - PDF styles: lines 1-1598
 *   - saveConversationAsPDF: lines 15066-15143
 *   - openExportModal / exportSelectedConversations: lines 15144-15586
 *   - Copy/export helpers: lines 22820-23000
 *   - generateSplitterChain: lines 15431-15464
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'markdown' | 'json' | 'text';
export type ExportMode = 'all' | 'chatgpt' | 'selected';
export type ExportAction = 'export' | 'copy';

export interface ExportOptions {
  format: ExportFormat;
  conversationId: string;
  includeTimestamps?: boolean;
  includeModelInfo?: boolean;
}

// ---------------------------------------------------------------------------
// PDF Styles
// ---------------------------------------------------------------------------

const pdfStyles: Record<string, string> = {
  style1: `
      body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          font-size: 11pt;
          color: #333;
          background: #ffffff;
          padding-right: 20px;
      }
      article {
          margin-top: 10px;
          margin-bottom: 10px;
          padding: 15px;
          border-radius: 8px;
          background: #F7F9FC;
          box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1);
          border-left: 5px solid #3498DB;
      }
      article:nth-child(odd) {
          border-left-color: #333;
      }
      article:nth-child(even) {
          margin-bottom: 16px;
      }
      h5, h6 {
          font-size: 14pt;
          font-weight: bold;
          color: #2C3E50;
          margin-top: 2px;
          margin-bottom: 10px;
          border-bottom: 2px solid #3498DB;
          padding-bottom: 5px;
      }
      p {
          margin: 0;
          padding: 0;
      }
      footer {
          font-size: 10pt;
          color: #777;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          position: fixed;
          right: 0;
          bottom: -100px;
          transform: translateY(-50%);
          padding-left: 4px;
      }
      footer a {
          color: #3498DB;
          text-decoration: none;
          font-weight: bold;
      }`,
  style2: `
      body {
        font-family: 'Courier New', Courier, monospace;
        font-size: 10pt;
        color: #EEE;
        background: #1E1E1E;
        padding: 20px;
      }
      article {
        margin: 20px 0;
        padding: 20px;
        border-radius: 0;
        background: #2C2C2C;
        border-left: 6px solid #FF9800;
      }
      article:nth-child(odd) {
        border-left-color: #FF5722;
      }
      article:nth-child(even) {
        margin-bottom: 24px;
      }
      h5, h6 {
        font-size: 16pt;
        font-weight: normal;
        color: #FFF;
        margin-top: 5px;
        margin-bottom: 15px;
        border-bottom: 1px solid #FF9800;
        padding-bottom: 3px;
      }
      p {
        margin: 5px 0;
        line-height: 1.5;
      }
      footer {
        font-size: 9pt;
        color: #BBB;
        writing-mode: vertical-lr;
        text-orientation: upright;
        position: fixed;
        left: 0;
        bottom: 20px;
        transform: translateY(0);
        padding-right: 5px;
      }
      footer a {
        color: #FF9800;
        text-decoration: none;
        font-weight: normal;
      }
    `,
  style3: `
      body {
        font-family: Georgia, 'Times New Roman', Times, serif;
        font-size: 12pt;
        color: #4A4A4A;
        background: #FAF9F6;
        padding: 30px;
      }
      article {
        margin: 15px 0;
        padding: 25px;
        border-radius: 5px;
        background: #FFF;
        border-left: 4px solid #8C8C8C;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      article:nth-child(odd) {
        border-left-color: #B47D56;
      }
      article:nth-child(even) {
        margin-bottom: 20px;
      }
      h5, h6 {
        font-size: 18pt;
        font-weight: bold;
        color: #333;
        margin-top: 10px;
        margin-bottom: 8px;
        border-bottom: 1px solid #B47D56;
        padding-bottom: 5px;
      }
      p {
        margin: 0 0 10px 0;
        line-height: 1.6;
      }
      footer {
        font-size: 10pt;
        color: #7D7D7D;
        writing-mode: vertical-rl;
        text-orientation: sideways;
        position: fixed;
        right: 10px;
        bottom: 10px;
        transform: rotate(180deg);
        padding-left: 8px;
      }
      footer a {
        color: #B47D56;
        text-decoration: underline;
        font-weight: bold;
      }
    `,
  style4: `
      body {
        font-family: 'Lucida Console', Monaco, monospace;
        font-size: 11pt;
        color: #E0E0E0;
        background: #000;
        padding: 20px;
      }
      article {
        margin: 10px 0;
        padding: 20px;
        border-radius: 10px;
        background: #111;
        box-shadow: 0 0 10px #00FFFF;
        border-left: 5px solid #00FF00;
      }
      article:nth-child(odd) {
        border-left-color: #FF00FF;
      }
      article:nth-child(even) {
        margin-bottom: 18px;
      }
      h5, h6 {
        font-size: 15pt;
        font-weight: bold;
        color: #00FFFF;
        margin-top: 5px;
        margin-bottom: 10px;
        border-bottom: 2px dashed #FF00FF;
        padding-bottom: 4px;
      }
      p {
        margin: 0;
        padding: 0;
      }
      footer {
        font-size: 10pt;
        color: #AAAAAA;
        writing-mode: vertical-rl;
        text-orientation: upright;
        position: fixed;
        right: 0;
        bottom: 0;
        transform: translateY(0);
        padding-left: 6px;
      }
      footer a {
        color: #FF00FF;
        text-decoration: none;
        font-weight: bold;
      }
    `,
  style5: `
      body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 11pt;
        color: #222;
        background: #F5F5F5;
        padding: 25px;
      }
      article {
        margin: 20px 0;
        padding: 20px;
        border-radius: 3px;
        background: #FFF;
        border-left: 4px solid #4CAF50;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
      }
      article:nth-child(odd) {
        border-left-color: #8BC34A;
      }
      article:nth-child(even) {
        margin-bottom: 22px;
      }
      h5, h6 {
        font-size: 14pt;
        font-weight: 600;
        color: #333;
        margin-top: 10px;
        margin-bottom: 12px;
        border-bottom: 3px solid #4CAF50;
        padding-bottom: 6px;
      }
      p {
        margin: 0;
        padding: 0 0 10px 0;
        line-height: 1.6;
      }
      footer {
        font-size: 9pt;
        color: #555;
        writing-mode: vertical-rl;
        text-orientation: sideways;
        position: fixed;
        left: 10px;
        bottom: 10px;
        transform: translateY(0);
        padding-right: 8px;
      }
      footer a {
        color: #4CAF50;
        text-decoration: none;
        font-weight: 600;
      }
    `,
  // Styles 6-28 follow the same pattern from the original source
  style6: `body{font-family:'Courier New',Courier,monospace;font-size:12pt;color:#3E3A33;background:#F4F1E9;padding:30px;line-height:1.5}article{margin:20px 0;padding:20px;border-radius:4px;background:#FFF;border-left:4px dotted #A67B5B;box-shadow:2px 2px 5px rgba(0,0,0,0.1)}article:nth-child(odd){border-left-color:#7D5A50}article:nth-child(even){margin-bottom:25px}h5,h6{font-size:16pt;font-weight:bold;color:#5B4636;margin-top:10px;margin-bottom:8px;border-bottom:1px dashed #A67B5B;padding-bottom:4px}p{margin:0 0 12px 0}footer{font-size:10pt;color:#7D5A50;writing-mode:vertical-rl;text-orientation:sideways;position:fixed;left:14px;bottom:20px;transform:rotate(0deg);padding-right:6px}footer a{color:#A67B5B;text-decoration:underline;font-weight:normal}`,
  style7: `body{font-family:'Roboto',sans-serif;font-size:11pt;color:#C0C0C0;background:linear-gradient(135deg,#0D0D0D,#1A1A1A);padding:25px}article{margin:15px 0;padding:20px;border-radius:8px;background:rgba(255,255,255,0.05);border-left:4px solid #00E5FF;box-shadow:0 0 10px rgba(0,229,255,0.5)}article:nth-child(odd){border-left-color:#FF4081}article:nth-child(even){margin-bottom:18px}h5,h6{font-size:18pt;font-weight:700;color:#00E5FF;margin-top:8px;margin-bottom:10px;border-bottom:2px solid #FF4081;padding-bottom:5px;text-shadow:1px 1px 3px rgba(0,0,0,0.7)}p{margin:0 0 10px 0}footer{font-size:10pt;color:#BDBDBD;writing-mode:vertical-rl;text-orientation:mixed;position:fixed;right:8px;bottom:30px;transform:translateY(-10%);padding-left:8px}footer a{color:#FF4081;text-decoration:none;font-weight:700}`,
  style8: `body{font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;font-size:12pt;color:#3B2F2F;background:#FFF8F0;padding:30px}article{margin:18px 0;padding:22px;border-radius:12px;background:#FDF6E3;border-left:5px solid #8F9779;box-shadow:0 2px 6px rgba(0,0,0,0.1)}article:nth-child(odd){border-left-color:#A3B18A}article:nth-child(even){margin-bottom:20px}h5,h6{font-size:17pt;font-weight:bold;color:#6B4F4F;margin-top:10px;margin-bottom:10px;border-bottom:2px solid #8F9779;padding-bottom:6px;font-style:italic}p{margin:0 0 12px 0;line-height:1.7}footer{font-size:10pt;color:#6B4F4F;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:4px;bottom:15px;transform:translateY(5%);padding-right:6px}footer a{color:#8F9779;text-decoration:none;font-weight:bold}`,
  style9: `body{font-family:'Comic Sans MS',cursive,sans-serif;font-size:13pt;color:#222;background:#FFEB3B;padding:20px}article{margin:15px 0;padding:20px;border-radius:15px;background:#FFF;border-left:6px solid #F44336;box-shadow:4px 4px 0px #3F51B5}article:nth-child(odd){border-left-color:#E91E63}article:nth-child(even){margin-bottom:20px}h5,h6{font-size:20pt;font-weight:bold;color:#3F51B5;margin-top:12px;margin-bottom:8px;border-bottom:3px dashed #F44336;padding-bottom:5px;text-shadow:2px 2px 0px #FF5722}p{margin:0 0 15px 0}footer{font-size:10pt;color:#3F51B5;writing-mode:vertical-rl;text-orientation:sideways;position:fixed;right:0px;bottom:10px;transform:rotate(0deg);padding-left:8px}footer a{color:#E91E63;text-decoration:underline;font-weight:bold}`,
  style10: `body{font-family:'Arial',sans-serif;font-size:11pt;color:#222;background:linear-gradient(45deg,#ECE9E6,#FFFFFF);padding:25px}article{margin:20px 0;padding:25px;border-radius:10px;background:#FFF;border-left:6px double #FF6F61;box-shadow:0 5px 15px rgba(0,0,0,0.1);transform:skew(-2deg)}article:nth-child(odd){border-left-color:#6B5B95}article:nth-child(even){margin-bottom:28px;transform:skew(2deg)}h5,h6{font-size:16pt;font-weight:bold;color:#FF6F61;margin-top:8px;margin-bottom:8px;border-bottom:2px solid #6B5B95;padding-bottom:4px;letter-spacing:1px}p{margin:0 0 12px 0;line-height:1.5}footer{font-size:10pt;color:#6B5B95;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:12px;bottom:25px;transform:translateY(0);padding-right:10px}footer a{color:#FF6F61;text-decoration:none;font-weight:bold}`,
  style11: `body{font-family:'Montserrat',sans-serif;font-size:12pt;color:#E0E8F9;background:radial-gradient(circle at center,#1B2735,#090A0F);padding:20px}article{margin:20px 0;padding:20px;border-radius:15px;background:radial-gradient(circle at center,#1B2735,#090A0F);border:1px dashed #E0E8F9;position:relative;overflow:hidden}article::before{content:"";position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(224,232,249,0.2),transparent 10%);transform:rotate(45deg)}h5,h6{font-size:16pt;font-weight:bold;color:#F0F8FF;margin:10px 0;border-bottom:2px solid #8BAEDC;padding-bottom:5px;text-transform:uppercase}p{margin:0 0 15px;line-height:1.6}footer{font-size:10pt;color:#A0AEC0;writing-mode:vertical-rl;text-orientation:mixed;position:fixed;right:0px;bottom:10px;border-left:2px solid #8BAEDC;padding-left:10px}footer a{color:#F0F8FF;text-decoration:none;font-weight:bold}`,
  style12: `body{font-family:'Comic Sans MS',cursive,sans-serif;font-size:13pt;color:#000;background:repeating-linear-gradient(45deg,#FF6B6B,#FF6B6B 10px,#FFF200 10px,#FFF200 20px);padding:20px}article{margin:15px 0;padding:25px;border-radius:0;background:#fff;border:3px solid #000;transform:rotate(-2deg)}h5,h6{font-size:18pt;font-weight:bold;color:#FF6B6B;margin:10px 0;text-decoration:underline wavy #000}p{margin:0 0 12px}footer{font-size:11pt;color:#000;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:4px;bottom:15px;transform:rotate(0deg);padding-right:8px}footer a{color:#FF6B6B;text-decoration:none;font-weight:bold}`,
  style13: `body{font-family:'Roboto Mono',monospace;font-size:11pt;color:#1C2833;background:#ECF0F1;padding:25px}article{margin:20px 0;padding:20px;background:#fff;border:2px solid #2980B9;border-radius:0;position:relative}h5,h6{font-size:16pt;font-weight:bold;color:#2980B9;margin:5px 0 10px;border-bottom:1px dashed #1C2833;padding-bottom:4px}p{margin:0 0 10px;line-height:1.4}footer{font-size:10pt;color:#1C2833;writing-mode:vertical-rl;text-orientation:upright;position:fixed;right:10px;bottom:10px;transform:translateY(-10%);padding-left:6px}footer a{color:#2980B9;text-decoration:none;font-weight:bold}`,
  style14: `body{font-family:'Dancing Script',cursive;font-size:12pt;color:#4A4A4A;background:#FAF3F0;padding:30px}article{margin:20px 0;padding:25px;border-radius:20px;background:rgba(255,255,255,0.8);border:none;position:relative;overflow:hidden}article::before{content:"";position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,transparent,rgba(255,183,197,0.3));mix-blend-mode:multiply}h5,h6{font-size:20pt;font-weight:bold;color:#D32F2F;margin:10px 0;text-shadow:1px 1px 3px rgba(211,47,47,0.5)}p{margin:0 0 15px;line-height:1.6}footer{font-size:10pt;color:#D32F2F;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:20px;bottom:20px;transform:rotate(0deg);padding-right:10px}footer a{color:#D32F2F;text-decoration:none;font-weight:bold}`,
  style15: `body{font-family:'Orbitron',sans-serif;font-size:12pt;color:#F8F8F8;background:radial-gradient(circle at 50% 50%,#000428,#004e92);padding:20px}article{margin:20px 0;padding:25px;border-radius:10px;background:rgba(0,68,146,0.8);border:3px solid rgba(255,255,255,0.2);position:relative}h5,h6{font-size:18pt;font-weight:bold;color:#00FFAB;margin:10px 0;letter-spacing:2px}p{margin:0 0 15px;line-height:1.5}footer{font-size:10pt;color:#00FFAB;writing-mode:vertical-rl;text-orientation:upright;position:fixed;right:4px;bottom:15px;transform:rotate(0deg);padding-left:10px}footer a{color:#00FFAB;text-decoration:none;font-weight:bold}`,
  style16: `body{font-family:'Lora',serif;font-size:12pt;color:#2C3E50;background:#ECF0F1;padding:25px}article{margin:20px 0;padding:25px;border-radius:8px;background:#FFF;border-top:5px solid #27AE60;border-bottom:5px solid #27AE60;position:relative}h5,h6{font-size:18pt;font-weight:bold;color:#27AE60;margin:10px 0;border-bottom:2px dotted #2C3E50;padding-bottom:5px}p{margin:0 0 15px;line-height:1.5}footer{font-size:10pt;color:#2C3E50;writing-mode:vertical-rl;text-orientation:sideways;position:fixed;left:20px;bottom:20px;transform:rotate(0deg);padding-right:10px}footer a{color:#27AE60;text-decoration:none;font-weight:bold}`,
  style17: `body{font-family:'Indie Flower',cursive;font-size:13pt;color:#444;background:#FFFBEC;padding:20px}article{margin:15px 0;padding:20px;border-radius:50px;background:#fff;border:4px double #F39C12;position:relative}h5,h6{font-size:20pt;font-weight:bold;color:#F39C12;margin:10px 0;text-decoration:overline}p{margin:0 0 15px;line-height:1.5}footer{font-size:11pt;color:#F39C12;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:4px;bottom:15px;transform:translateY(0) rotate(0deg);padding-right:10px}footer a{color:#F39C12;text-decoration:none;font-weight:bold}`,
  style18: `body{font-family:'Roboto',sans-serif;font-size:12pt;color:#fff;background:#000;padding:20px}article{margin:20px 0;padding:25px;border-radius:0;background:#222;position:relative;overflow:hidden}h5,h6{font-size:18pt;font-weight:bold;color:#FF4081;margin:10px 0;text-shadow:2px 2px 0 #000}p{margin:0 0 15px;line-height:1.4}footer{font-size:10pt;color:#FF4081;writing-mode:vertical-rl;text-orientation:upright;position:fixed;right:10px;bottom:20px;transform:rotate(0deg);padding-left:10px}footer a{color:#FF4081;text-decoration:none;font-weight:bold}`,
  style19: `body{font-family:'Roboto',sans-serif;font-size:12pt;color:#333;background:linear-gradient(135deg,#f0f0f0,#ffffff);padding:20px}article{margin:20px 0;padding:30px;background:#FFF;border-radius:10px;transform:perspective(600px) rotateY(5deg);border:2px solid #ccc}h5,h6{font-size:18pt;font-weight:bold;color:#ff4081;margin:10px 0;transform:rotate(-1deg)}p{margin:0 0 15px;line-height:1.5}footer{font-size:10pt;color:#ff4081;writing-mode:vertical-rl;text-orientation:sideways;position:fixed;left:20px;bottom:20px;transform:translateY(0) rotate(0deg);padding-right:10px}footer a{color:#ff4081;text-decoration:none;font-weight:bold}`,
  style20: `body{font-family:'Lucida Console',Monaco,monospace;font-size:10pt;color:#33FF00;background:linear-gradient(90deg,#000,#222);padding:20px}article{margin:20px 0;padding:20px;border-radius:0;background:#111;border:1px solid #33FF00;position:relative}h5,h6{font-size:14pt;font-weight:bold;color:#33FF00;margin:10px 0;text-shadow:1px 1px 2px #000}p{margin:0 0 12px;line-height:1.4}footer{font-size:10pt;color:#33FF00;writing-mode:vertical-rl;text-orientation:upright;position:fixed;right:4px;bottom:20px;transform:rotate(0deg);padding-left:10px}footer a{color:#33FF00;text-decoration:none;font-weight:bold}`,
  style21: `body{font-family:'Open Sans',sans-serif;font-size:12pt;color:#FFFFFF;background:linear-gradient(to bottom,#2C3E50,#4CA1AF);padding:20px}article{margin:20px 0;padding:20px;border-radius:10px;background:linear-gradient(to bottom,#2C3E50,#4CA1AF);border:1px solid rgba(255,255,255,0.3);position:relative;overflow:hidden}h5,h6{font-size:16pt;font-weight:bold;color:#E0F7FA;margin:10px 0;border-bottom:2px solid rgba(255,255,255,0.4);padding-bottom:5px}p{margin:0 0 15px;line-height:1.6}footer{font-size:10pt;color:#B2EBF2;writing-mode:vertical-rl;text-orientation:mixed;position:fixed;right:4px;bottom:15px;padding-left:10px}footer a{color:#E0F7FA;text-decoration:none;font-weight:bold}`,
  style22: `body{font-family:'Merriweather',serif;font-size:12pt;color:#2E2E2E;background:linear-gradient(135deg,#dfe9f3,#ffffff);padding:25px}article{margin:20px 0;padding:20px;border-radius:12px;background:#fff;border-left:5px solid #6B8E23;box-shadow:0 2px 8px rgba(0,0,0,0.1);position:relative}h5,h6{font-size:18pt;font-weight:bold;color:#4E6E1F;margin:10px 0;border-bottom:2px dotted #6B8E23;padding-bottom:6px}p{margin:0 0 15px;line-height:1.6}footer{font-size:10pt;color:#6B8E23;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:4px;bottom:15px;transform:rotate(0deg);padding-right:10px}footer a{color:#4E6E1F;text-decoration:none;font-weight:bold}`,
  style23: `body{font-family:'Lato',sans-serif;font-size:12pt;color:#FFFFFF;background:linear-gradient(135deg,#0F2027,#203A43,#2C5364);padding:20px}article{margin:20px 0;padding:25px;border-radius:8px;background:linear-gradient(135deg,#0F2027,#203A43,#2C5364);border:2px solid rgba(255,255,255,0.3);position:relative}h5,h6{font-size:17pt;font-weight:bold;color:#B2DFDB;margin:10px 0;border-bottom:2px solid rgba(255,255,255,0.5);padding-bottom:5px}p{margin:0 0 15px;line-height:1.5}footer{font-size:10pt;color:#B2DFDB;writing-mode:vertical-rl;text-orientation:mixed;position:fixed;right:4px;bottom:15px;padding-left:10px}footer a{color:#B2DFDB;text-decoration:none;font-weight:bold}`,
  style24: `body{font-family:'Roboto',sans-serif;font-size:12pt;color:#4E342E;background:linear-gradient(135deg,#D7CCC8,#FFF3E0);padding:25px}article{margin:20px 0;padding:20px;border-radius:10px;background:#fff7e6;position:relative}h5,h6{font-size:16pt;font-weight:bold;color:#8D6E63;margin:10px 0;border-bottom:2px dashed #D7CCC8;padding-bottom:4px}p{margin:0 0 15px;line-height:1.5}footer{font-size:10pt;color:#8D6E63;writing-mode:vertical-rl;text-orientation:sideways;position:fixed;left:4px;bottom:15px;transform:rotate(0deg);padding-right:10px}footer a{color:#8D6E63;text-decoration:none;font-weight:bold}`,
  style25: `body{font-family:'Playfair Display',serif;font-size:12pt;color:#333;background:#f2f2f2;padding:25px}article{margin:20px 0;padding:25px;border-radius:15px;background:rgba(255,255,255,0.9);border:1px solid #ccc;position:relative;box-shadow:0 4px 10px rgba(0,0,0,0.1)}h5,h6{font-size:18pt;font-weight:bold;color:#555;margin:10px 0;border-bottom:2px solid #ccc;padding-bottom:5px}p{margin:0 0 15px;line-height:1.6}footer{font-size:10pt;color:#777;writing-mode:vertical-rl;text-orientation:mixed;position:fixed;left:4px;bottom:15px;padding-right:10px}footer a{color:#555;text-decoration:none;font-weight:bold}`,
  style26: `body{font-family:'Poppins',sans-serif;font-size:12pt;color:#fff;background:linear-gradient(135deg,#FF5F6D,#FFC371);padding:20px}article{margin:20px 0;padding:25px;border-radius:10px;background:linear-gradient(135deg,#FF5F6D,#FFC371);border-left:5px solid #FF5F6D;position:relative}h5,h6{font-size:18pt;font-weight:bold;color:#FFF;margin:10px 0;border-bottom:2px solid rgba(255,255,255,0.5);padding-bottom:5px}p{margin:0 0 15px;line-height:1.6}footer{font-size:10pt;color:#FFF;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:4px;bottom:15px;transform:rotate(0deg);padding-right:10px}footer a{color:#FF5F6D;text-decoration:none;font-weight:bold}`,
  style27: `body{font-family:'Fira Sans',sans-serif;font-size:12pt;color:#000;background:radial-gradient(ellipse at center,#3a3a3a 0%,#000 80%);padding:20px}article{margin:20px 0;color:#FFF;padding:25px;border-radius:10px;background:rgba(50,50,50,0.8);border:2px solid #7F00FF;position:relative}h5,h6{font-size:17pt;font-weight:bold;color:#D1C4E9;margin:10px 0;border-bottom:2px solid rgba(255,255,255,0.3);padding-bottom:5px}p{margin:0 0 15px;line-height:1.5}footer{font-size:10pt;color:#D1C4E9;writing-mode:vertical-rl;text-orientation:upright;position:fixed;right:4px;bottom:15px;transform:rotate(0deg);padding-left:10px}footer a{color:#7F00FF;text-decoration:none;font-weight:bold}`,
  style28: `body{font-family:'Raleway',sans-serif;font-size:12pt;color:#333;background:linear-gradient(135deg,#f6d365 0%,#fda085 100%);padding:25px;background-blend-mode:multiply}article{margin:20px 0;padding:25px;border-radius:15px;background:rgba(255,255,255,0.8);border:2px dashed #fda085;position:relative}h5,h6{font-size:17pt;font-weight:bold;color:#fda085;margin:10px 0;border-bottom:2px solid #f6d365;padding-bottom:5px}p{margin:0 0 15px;line-height:1.6}footer{font-size:10pt;color:#fda085;writing-mode:vertical-rl;text-orientation:upright;position:fixed;left:4px;bottom:15px;transform:rotate(0deg);padding-right:10px}footer a{color:#f6d365;text-decoration:none;font-weight:bold}`,
};

const commonStyle = `
@media print {
  .hidden-print {
    display: none !important;
  }
}
.hidden-print {
  display: flex;
  align-items: center;
}
body {
  direction: ltr;
  unicode-bidi: embed;
  line-height: 2;
}
table {
  table-layout: fixed;
  border-collapse: collapse;
  width: 100%;
}
th, td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}
th {
  background-color: #f2f2f230;
}
li > p {
  display: inline;
  text-align: justify;
}
pre {
  text-align: left;
  white-space: normal;
  font-family: inherit;
}
pre code {
  white-space: pre-wrap;
}
code:not(:is(div[data-message-author-role="user"] *)) {
  display: inline-block;
  font-family: 'Fira Code', 'Source Code Pro', monospace;
  font-size: 11pt;
  background-color: #f0f0f0;
  color: #c7254e;
  padding: 2px 4px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin: 8px 0;
}
img {
  max-width: 400px;
  max-height: fit-content;
  object-fit: contain;
  border: 1px solid #ddd;
  border-radius: 16px;
  margin: 8px 0;
}
blockquote, q {
  font-style: italic;
  border-left: 2px solid #ddd;
  padding-left: 8px;
  margin: 8px 0;
}
button:not(:has(img)), select, [role="button"] {
  background-color: rgb(216, 216, 216);
  border-radius: 8px;
  border: 1px solid rgba(51, 51, 51);
  shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  color: #333333;
  cursor: pointer;
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  list-style: none;
  margin: 8px;
  padding: 4px 12px;
  text-align: center;
  transition: all 200ms;
  vertical-align: baseline;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
button:has(img) {
  background: none;
  border: none;
  padding: 0;
}
`;

/**
 * Returns the combined common + selected PDF style.
 */
export function getPDFStyle(styleName: string): string {
  const style = pdfStyles[styleName] || pdfStyles.style1;
  return `${commonStyle}\n${style}`;
}

// Style option labels for the PDF style picker
const styleLabels: Record<string, string> = {
  style1: 'Default',
  style2: 'Dark Minimal',
  style3: 'Elegant Serif',
  style4: 'Retro Neon',
  style5: 'Clean and Structured',
  style6: 'Vintage Typewriter',
  style7: 'Futuristic Circuit',
  style8: 'Organic Nature',
  style9: 'Comic Pop',
  style10: 'Abstract Geometry',
  style11: 'Celestial Night',
  style12: 'Pop Art Explosion',
  style13: 'Industrial Blueprint',
  style14: 'Watercolor Dream',
  style15: 'Cosmic Space',
  style16: 'Botanical Illustration',
  style17: 'Digital Doodle',
  style18: 'Glitch Art',
  style19: 'Origami Fold',
  style20: 'Retro Computer',
  style21: 'Underwater Dream',
  style22: 'Enchanted Forest',
  style23: 'Aurora Sky',
  style24: 'Desert Mirage',
  style25: 'Mystic Marble',
  style26: 'Tropical Vibes',
  style27: 'Galactic Nebula',
  style28: 'Cosmic Watercolor',
};

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  formatTime,
  escapeHTML,
  closeMenus,
  sleep,
  openUpgradeModal,
  errorUpgradeConfirmation,
  getConversationIdFromUrl,
  copyToClipboard,
  copyRichText,
  removeTimeStampCounterFromCopy,
  fileFormatConverter,
} from '../../utils/shared';
import { toast, loadingSpinner, addTooltip, isDescendant } from '../isolated-world/ui/primitives';
import { translate } from './i18n';
import { getConversationById, getConversationTextDocs, getConversationIds } from '../isolated-world/api';
import { replaceCitations, sanitizeHtml } from './conversation-renderer';
import { removeSystemMessages } from '../isolated-world/ui/markdown';

import { handleAddToNoteText } from './notes';

// ---------------------------------------------------------------------------
// Ported helpers
// ---------------------------------------------------------------------------

/**
 * Fetch conversations by IDs. If `ids` is non-empty, resolve immediately;
 * otherwise fall back to `getConversationIds` to retrieve all conversation IDs.
 *
 * Original: content.isolated.end.js line 4257
 */
export function getSelectedConversations(ids: string[] = [], includeArchived = true): Promise<string[]> {
  return new Promise((resolve) => {
    if (ids?.length > 0) {
      resolve(ids);
    } else {
      resolve(getConversationIds(null, null, includeArchived));
    }
  });
}

/**
 * Attach event listeners to the subscription/upgrade modal gallery button.
 *
 * Original: content.isolated.end.js line 9701
 */
export function addSubscriptionModalEventListeners(): void {
  document.querySelector('#upgrade-to-pro-button-gallery')?.addEventListener('click', () => {
    openUpgradeModal(false);
  });
}

/**
 * Show a date-range picker dialog with start/end date inputs and confirm/cancel buttons.
 *
 * @param title          Dialog header text
 * @param subtitle       Subtitle / instruction text
 * @param cancelText     Label for the cancel button
 * @param confirmText    Label for the confirm button
 * @param onCancel       Callback when user cancels
 * @param onConfirm      Callback receiving (startTimestamp, endTimestamp)
 * @param color          Button color variant: 'red' | 'orange' | 'green'
 * @param autoClose      Whether to auto-remove the dialog on confirm
 *
 * Original: content.isolated.end.js line 5623
 */
export function showDateSelectorDialog(
  title = '',
  subtitle = 'Select date range',
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  onCancel: (() => void) | null = null,
  onConfirm: ((start: number, end: number) => void) | null = null,
  color: 'red' | 'orange' | 'green' = 'red',
  autoClose = true,
): void {
  const existing = document.querySelector('#date-selector-dialog');
  if (existing) existing.remove();

  const colorClasses: Record<string, string> = {
    red: 'btn-danger',
    orange: 'btn-warning',
    green: 'btn-success',
  };

  const html = `<div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
  <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
    <div id="date-selector-dialog-content" role="dialog" data-state="open" class="relative col-auto col-start-2 row-auto row-start-2 w-full rounded-xl text-start shadow-xl transition-all start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 bg-token-sidebar-surface-primary max-w-xl border-token-border-medium border" tabindex="-1" style="pointer-events: auto;">
      <div class="p-4 flex items-center justify-between border-b border-token-border-medium">
        <div class="flex">
          <div class="flex items-center">
            <div class="flex grow flex-col gap-1">
              <h2 as="h2" class="text-lg font-medium leading-6 text-token-text-tertiary">${translate(title)}</h2>
            </div>
          </div>
        </div>
      </div>
      <div class="p-4">
        <h4 as="h4" class="text-md mt-2 text-token-text-primary">${translate(subtitle)}</h2>
        <div class="flex items-center justify-center mt-4">
          <div class="flex flex-col flex-wrap mx-10">
            <label for="start-date" class="text-sm text-token-text-tertiary mb-1">Start Date</label>
            <input id="start-date" type="date" class="p-2 rounded-md border border-token-border-medium bg-token-main-surface-primary text-token-text-primary" placeholder="Select start date" />
          </div>
          <span class="text-xl text-token-text-tertiary relative top-3">\u2192</span>
          <div class="flex flex-col flex-wrap mx-10">
            <label for="end-date" class="text-sm text-token-text-tertiary mb-1">End Date</label>
            <input id="end-date" type="date" class="p-2 rounded-md border border-token-border-medium bg-token-main-surface-primary text-token-text-primary" placeholder="Select end date" />
          </div>
        </div>
        <div class="mt-10">
          <div class="mt-5 flex justify-between">
            <div class="flex gap-3 ms-auto">
              <button id="cancel-button" class="btn relative btn-secondary" as="button">
                <div class="flex w-full gap-2 items-center justify-center">${translate(cancelText)}</div>
              </button>
              <button id="confirm-button" class="btn relative ${colorClasses[color]} text-white w-32" as="button">
                <div class="flex w-full gap-2 items-center justify-center">${translate(confirmText)}</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

  const wrapper = document.createElement('div');
  wrapper.id = 'date-selector-dialog';
  wrapper.className = 'absolute inset-0';
  wrapper.style.cssText = 'z-index: 100001;';
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  const confirmBtn = document.querySelector('#date-selector-dialog #confirm-button') as HTMLElement;
  const cancelBtn = document.querySelector('#date-selector-dialog #cancel-button') as HTMLElement;

  confirmBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();

    const btn = document.querySelector('#date-selector-dialog #confirm-button') as HTMLButtonElement | null;
    if (btn?.querySelector('#progress-spinner')) return;

    const startVal = (document.querySelector('#start-date') as HTMLInputElement).value;
    const endVal = (document.querySelector('#end-date') as HTMLInputElement).value;

    if (!startVal || !endVal) {
      toast('Please select start and end date', 'error');
      return;
    }
    if (startVal > endVal) {
      toast('Start date cannot be greater than end date', 'error');
      return;
    }

    if (btn) {
      btn.disabled = true;
      const inner = btn.querySelector('div');
      if (inner) {
        inner.innerHTML =
          '<div class="w-full h-full inset-0 flex items-center justify-center text-white"><svg id="progress-spinner" x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-md"><circle fill="transparent" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg></div>';
      }
    }

    if (onConfirm) {
      onConfirm(new Date(startVal).getTime(), new Date(endVal).getTime());
    }
    if (autoClose) wrapper.remove();
  });

  cancelBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();
    if (document.querySelector('#date-selector-dialog #confirm-button')?.querySelector('#progress-spinner')) return;
    if (onCancel) onCancel();
    wrapper.remove();
  });

  wrapper.addEventListener('click', (ev) => {
    if (document.querySelector('#date-selector-dialog #confirm-button')?.querySelector('#progress-spinner')) return;
    const content = document.querySelector('#date-selector-dialog-content');
    if (!isDescendant(content, ev.target)) {
      if (onCancel) onCancel();
      wrapper.remove();
    }
  });
}

let exportAllCanceled = false;
let exportTimeout: ReturnType<typeof setTimeout>;

// ---------------------------------------------------------------------------
// Save as PDF
// ---------------------------------------------------------------------------

/**
 * Open the conversation in a new window with PDF-friendly HTML, a style
 * picker, and a print button.
 *
 * @param conversationId  The conversation to render
 * @param singleArticle   Optional: render only this article element
 */
export async function saveConversationAsPDF(
  conversationId: string,
  singleArticle: HTMLElement | null = null,
): Promise<void> {
  const conv = await getConversationById(conversationId);

  // Expand collapsed code blocks before cloning
  document
    .querySelector('main article')
    ?.parentElement?.querySelectorAll('button svg > use[href*="ba3792"]')
    .forEach((el) => {
      if (!el?.closest('svg')?.classList?.contains('rotate-90')) {
        (el?.closest('button') as HTMLElement)?.click();
      }
    });

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  // Show loading spinner in the new window
  printWindow.document.write(
    `<html><head><title>${conv.title}</title></head><body>` +
      '<div style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<style>.spinner_S1WN{animation:spinner_MGfb .8s linear infinite;animation-delay:-.8s}' +
      '.spinner_Km9P{animation-delay:-.65s}.spinner_JApP{animation-delay:-.5s}' +
      '@keyframes spinner_MGfb{93.75%,100%{opacity:.2}}</style>' +
      '<circle class="spinner_S1WN" cx="4" cy="12" r="3"/>' +
      '<circle class="spinner_S1WN spinner_Km9P" cx="12" cy="12" r="3"/>' +
      '<circle class="spinner_S1WN spinner_JApP" cx="20" cy="12" r="3"/>' +
      '</svg></div></body></html>',
  );

  await sleep(1000);

  // Clone content
  let content = singleArticle
    ? (singleArticle.cloneNode(true) as HTMLElement)
    : (document.querySelector('main article')?.parentElement?.cloneNode(true) as HTMLElement);

  if (!content) return;

  // De-duplicate images
  const seenSrc = new Set<string>();
  content.querySelectorAll('img').forEach((img) => {
    if (seenSrc.has(img.src)) {
      img.parentElement?.remove();
    } else {
      seenSrc.add(img.src);
    }
  });

  // If rendering a single article, wrap it and clean headers
  if (singleArticle) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(content);
    content = wrapper;
    const h6 = content.querySelector('h6');
    if (h6?.textContent === 'ChatGPT said:') h6.remove();
  }

  // Keep only article elements
  content.childNodes.forEach((child) => {
    if ((child as HTMLElement).tagName !== 'ARTICLE') {
      (child as HTMLElement).remove?.();
    }
  });

  // Wrap each article's content in <pre>
  content.querySelectorAll('article').forEach((article) => {
    const pre = document.createElement('pre');
    pre.innerHTML = article.innerHTML;
    article.innerHTML = '';
    article.appendChild(pre);
  });

  // Fix empty headings
  const h5Elements = Array.from(content.querySelectorAll('h5'));
  h5Elements.forEach((h5, idx) => {
    if (h5.textContent === '') {
      if (h5Elements[idx - 1]?.textContent?.includes('You said')) {
        h5.textContent = 'ChatGPT said:';
      } else {
        h5.textContent = 'You said:';
      }
    }
  });

  // Remove interactive elements
  content.querySelectorAll('button, div[role="button"]').forEach((btn) => {
    (btn as HTMLElement).removeAttribute('role');
    if (!(btn as HTMLElement).querySelector('img')?.src?.includes('files')) {
      if (!(btn as HTMLElement).id?.startsWith('textdoc-message-')) {
        btn.remove();
      }
    }
  });

  // Clean up styles / hidden / invisible elements
  content.querySelectorAll('*').forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style?.opacity === '0') htmlEl.remove();
    if (htmlEl.style?.display === 'none') htmlEl.remove();
    htmlEl.removeAttribute('style');
  });

  // Preserve indented blocks
  content.querySelectorAll('div[class*="ps-4"], div[class*="overflow-clip"]').forEach((el) => {
    (el as HTMLElement).style.borderLeft = '2px solid #888';
    (el as HTMLElement).style.paddingLeft = '1rem';
    (el as HTMLElement).style.margin = '1rem 0.5rem';
  });

  content.querySelectorAll('*').forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.classList?.contains('invisible')) htmlEl.remove();
    if (htmlEl.classList?.contains('hidden')) htmlEl.remove();
    if (htmlEl.classList?.contains('opacity-0')) htmlEl.remove();
    htmlEl.removeAttribute('class');
  });

  content.querySelectorAll('[dir="auto"]').forEach((el) => {
    el.setAttribute('dir', 'ltr');
  });

  // Remove metadata overlays
  content
    .querySelectorAll(
      '#message-char-word-counter, #message-timestamp, #message-instructions, div[id^="message-actions-"]',
    )
    .forEach((el) => el.remove());

  // Fix anchor links
  content.querySelectorAll('a').forEach((a) => {
    if (a.parentElement?.tagName === 'DIV') {
      a.parentElement.replaceWith(a);
      a.style.cssText =
        'margin: 0 4px; background-color: #f0f0f0; padding: 0px 4px; border-radius: 4px; display: inline-block;line-height:1.8;word-break: break-all;overflow-wrap: break-word;';
    }
  });

  // Handle selected-messages mode
  const exportModeEl = document.querySelector(
    'input[name="export-all-modal-export-mode"]:checked',
  ) as HTMLInputElement | null;
  if ((exportModeEl?.value || 'all') === 'selected') {
    const selectedIds = Array.from(
      document.querySelectorAll('input[name="export-all-modal-message-checkbox"]:checked'),
    ).map((cb) => (cb as HTMLInputElement).value);
    content.querySelectorAll('article').forEach((article) => {
      const keep = selectedIds.some(
        (id) => article.getAttribute('data-turn-id') === id || article.querySelector(`div[data-message-id="${id}"]`),
      );
      if (!keep) article.remove();
    });
  }

  // Embed text docs
  const textDocEls = content.querySelectorAll('div[id^="textdoc-message-"]');
  const textDocs = (await getConversationTextDocs(conversationId)) as any[];
  textDocEls.forEach((el) => {
    const docId = el.id.split('textdoc-message-')[1];
    const doc = textDocs.find((d: any) => d.id === docId);
    if (doc) {
      (el as HTMLElement).style.height = 'auto';
      el.lastElementChild!.innerHTML = `<pre><code>${escapeHTML(doc.content)}</code></pre>`;
    }
  });

  // Build style picker options
  const styleOptions = Object.entries(styleLabels)
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join('');

  // Write the final document
  printWindow.document.body.innerHTML = '';
  printWindow.document.write(
    `<html><head><title>${conv.title}</title>` +
      `<style id="dynamic-style">${getPDFStyle('style1')}</style></head><body>`,
  );
  printWindow.document.write('<div class="hidden-print">');
  printWindow.document.write('<span>Select the style: </span>');
  printWindow.document.write(`<select id="style-btn">${styleOptions}</select>`);
  printWindow.document.write('<span>then click on print</span>');
  printWindow.document.write('<button id="print-btn">Print</button>');
  if (!singleArticle) {
    printWindow.document.write('<div style="margin-left:auto;">');
    printWindow.document.write('<button id="print-mode-btn">Hide User Messages</button>');
    printWindow.document.write('</div>');
  }
  printWindow.document.write('</div>');
  printWindow.document.write(content.outerHTML);
  printWindow.document.write(
    '<footer>Created by <a href="https://chromewebstore.google.com/detail/council-extension" target="_blank" rel="noreferrer">Council</a></footer>',
  );
  printWindow.document.write('</body></html>');
  printWindow.document.close();

  printWindow.onload = function () {
    // Style switcher
    printWindow.document.getElementById('style-btn')?.addEventListener('change', (ev) => {
      const val = (ev.target as HTMLSelectElement).value;
      const dynStyle = printWindow.document.getElementById('dynamic-style');
      if (dynStyle) dynStyle.innerHTML = getPDFStyle(val);
    });

    // Print button
    printWindow.document.getElementById('print-btn')?.addEventListener('click', () => {
      printWindow.print();
    });

    // Toggle user messages
    const toggleBtn = printWindow.document.getElementById('print-mode-btn');
    toggleBtn?.addEventListener('click', () => {
      const show = toggleBtn.textContent === 'Show User Messages';
      printWindow.document.querySelectorAll('article').forEach((article) => {
        const h6 = article.querySelector('h6');
        if (h6) (h6 as HTMLElement).style.display = show ? 'block' : 'none';
        if (article.querySelector('div[data-message-author-role="user"]')) {
          (article as HTMLElement).style.display = show ? 'block' : 'none';
        }
      });
      toggleBtn.textContent = show ? 'Hide User Messages' : 'Show User Messages';
    });
  };
}

// ---------------------------------------------------------------------------
// Export modal
// ---------------------------------------------------------------------------

/**
 * Open the export modal UI.
 *
 * @param conversationIds  Array of conversation IDs to export (empty = all)
 * @param mode             'all' | 'favorite' | 'folder' | 'selected' | 'current' | 'dateRange' | 'project'
 * @param folderName       Optional folder name for labeling
 */
export async function openExportModal(conversationIds: string[] = [], mode = 'all', folderName = ''): Promise<void> {
  clearTimeout(exportTimeout);
  exportAllCanceled = false;

  const hasSubscription = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0px;left:0px;width:100%;height:100%;z-index:100001;display:flex;align-items:center;justify-content:center;';
  overlay.classList.add('bg-black/50', 'dark:bg-black/80', 'text-token-text-primary');
  overlay.id = 'export-all-modal';
  overlay.addEventListener('click', (ev) => {
    const progressFill = document.querySelector('#export-all-modal-progress-bar-fill') as HTMLElement;
    if (
      (ev.target as HTMLElement).id === 'export-all-modal' &&
      (progressFill?.style.width === '0%' || progressFill?.style.width === '100%')
    ) {
      overlay.remove();
    }
  });

  const titleMap: Record<string, string> = {
    all: 'Export All Conversations',
    favorite: 'Export Favorite Conversations',
    folder: 'Export Folder Conversations',
    selected: 'Export Selected Conversations',
    current: 'Export Current Conversation',
    dateRange: 'Export Conversation in Date Range',
    project: 'Export All Conversations in Project',
  };

  const modal = document.createElement('div');
  modal.style.cssText = 'max-width:700px;min-width:500px;min-height:300px;max-height:90vh;';
  modal.classList.add(
    'bg-token-main-surface-primary',
    'rounded-md',
    'flex',
    'flex-col',
    'items-start',
    'justify-start',
    'border',
    'border-token-border-medium',
    'relative',
    'shadow-md',
  );
  overlay.appendChild(modal);

  // Header
  const header = document.createElement('div');
  header.classList.add('w-full');
  header.innerHTML = `
  <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
    <div class="flex">
      <div class="flex items-center">
        <div class="flex grow gap-1">
          <h2 class="text-lg font-medium leading-6 text-token-text-tertiary">
          ${translate(titleMap[mode] ?? titleMap.all ?? '')}</h2>
        </div>
      </div>
    </div>
  </div>`;
  modal.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.classList.add(
    'w-full',
    'h-full',
    'flex',
    'flex-col',
    'items-start',
    'justify-start',
    'relative',
    'p-4',
    'overflow-hidden',
  );
  modal.appendChild(body);

  // Export mode section
  const modeLabel = document.createElement('div');
  modeLabel.classList.add('font-semibold', 'text-token-text-primary', 'my-1');
  modeLabel.textContent = translate('How would you like to export the conversation?');
  body.appendChild(modeLabel);

  const modeWrapper = document.createElement('div');
  modeWrapper.classList.add(
    'flex',
    'flex-wrap',
    'items-start',
    'justify-start',
    'w-full',
    'mt-2',
    'text-token-text-tertiary',
  );
  body.appendChild(modeWrapper);

  const currentConvId = getConversationIdFromUrl();
  const isSingleCurrent = conversationIds.length === 1 && conversationIds[0] === currentConvId;

  const exportModeOptions = [
    {
      id: 'export-all-modal-all-checkbox',
      name: 'export-all-modal-export-mode',
      value: 'all',
      label: 'Export all messages',
    },
    {
      id: 'export-all-modal-chatgpt-checkbox',
      name: 'export-all-modal-export-mode',
      value: 'chatgpt',
      label: 'Export ChatGPT messages only',
    },
    {
      id: 'export-all-modal-selected-checkbox',
      name: 'export-all-modal-export-mode',
      value: 'selected',
      label: `Export selected messages ${isSingleCurrent ? '' : '(Available only when exporting current conversation)'}`,
    },
  ];

  exportModeOptions.forEach((opt) => {
    const row = document.createElement('div');
    row.classList.add('w-full', 'ps-3', 'my-1');
    modeWrapper.appendChild(row);

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.id = opt.id;
    radio.name = opt.name;
    radio.value = opt.value;
    radio.checked = opt.value === 'all';
    radio.disabled = opt.value === 'selected' && !isSingleCurrent;
    radio.style.opacity = opt.value === 'selected' && !isSingleCurrent ? '0.5' : '1';
    radio.addEventListener('change', (ev) => {
      const val = (ev.target as HTMLInputElement).value;
      if (!hasSubscription && val === 'selected') {
        (ev as Event).preventDefault();
        radio.checked = false;
        (document.querySelector('#export-all-modal-all-checkbox') as HTMLInputElement).checked = true;
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message: 'Exporting selected messages from a conversation requires a Pro subscription.',
        });
        return;
      }
      if (val === 'selected') {
        showMessageListInExportModal();
      } else {
        hideMessageListInExportModal();
      }
    });
    row.appendChild(radio);

    const label = document.createElement('label');
    label.htmlFor = opt.id;
    label.style.cssText = 'font-size:0.875rem;margin-left:8px;';
    label.innerHTML = opt.label;
    row.appendChild(label);
  });

  // Message list for selected mode
  const messageListWrapper = document.createElement('div');
  messageListWrapper.id = 'export-all-modal-message-list-wrapper';
  messageListWrapper.classList.add(
    'hidden',
    'w-full',
    'overflow-y-auto',
    'mt-2',
    'text-token-text-tertiary',
    'border',
    'border-token-border-medium',
    'rounded-md',
    'p-2',
    'bg-token-main-surface-secondary',
  );
  messageListWrapper.style.maxHeight = '100%';
  body.appendChild(messageListWrapper);

  // Select/deselect all
  const selectAllRow = document.createElement('div');
  selectAllRow.classList.add(
    'w-full',
    'flex',
    'items-center',
    'justify-start',
    'border-b',
    'border-token-border-medium',
  );
  messageListWrapper.appendChild(selectAllRow);

  const selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  selectAllCb.id = 'export-all-modal-select-deselect-all-checkbox';
  selectAllCb.classList.add('m-2', 'text-token-text-primary');
  selectAllRow.appendChild(selectAllCb);

  const selectAllLabel = document.createElement('label');
  selectAllLabel.htmlFor = 'export-all-modal-select-deselect-all-checkbox';
  selectAllLabel.style.cssText = 'font-size:1rem;font-weight:600;';
  selectAllLabel.textContent = translate('Select/Deselect All');
  selectAllRow.appendChild(selectAllLabel);

  selectAllCb.addEventListener('change', (ev) => {
    const checked = (ev.target as HTMLInputElement).checked;
    messageListWrapper
      .querySelectorAll<HTMLInputElement>('input[name="export-all-modal-message-checkbox"]')
      .forEach((cb) => {
        cb.checked = checked;
      });
  });

  // Populate message list from current conversation articles
  document.querySelectorAll('main article').forEach((article) => {
    const text = article.textContent
      ?.replace(/\s+/g, ' ')
      .replace(/You said:|ChatGPT said:/g, '')
      .trim()
      .slice(0, 100);
    if (!text) return;

    const turnId = article.getAttribute('data-turn-id');
    const turn = article.getAttribute('data-turn');

    const row = document.createElement('div');
    row.classList.add('w-full', 'my-1', 'flex', 'items-center', 'overflow-hidden', 'cursor-pointer');
    messageListWrapper.appendChild(row);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `export-all-modal-message-${turnId}-checkbox`;
    cb.name = 'export-all-modal-message-checkbox';
    cb.value = turnId || '';
    cb.classList.add('m-2');
    row.appendChild(cb);

    const msgLabel = document.createElement('label');
    msgLabel.htmlFor = cb.id;
    msgLabel.style.cssText = 'font-size:0.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    msgLabel.textContent = text;
    if (turn === 'assistant') msgLabel.classList.add('text-token-text-secondary');
    row.appendChild(msgLabel);
  });

  // Format selection
  const formatLabel = document.createElement('div');
  formatLabel.classList.add('font-semibold', 'text-token-text-primary', 'mt-6', 'mb-1');
  formatLabel.textContent = translate('Select the format(s) for export');
  body.appendChild(formatLabel);

  const formatWrapper = document.createElement('div');
  formatWrapper.classList.add(
    'flex',
    'items-center',
    'justify-between',
    'w-full',
    'mt-2',
    'text-token-text-tertiary',
    'px-2',
  );
  body.appendChild(formatWrapper);

  let selectedFormats: string[] = ['text'];
  const formatOptions = [
    { id: 'export-all-modal-markdown-checkbox', value: 'markdown', label: 'Markdown' },
    { id: 'export-all-modal-json-checkbox', value: 'json', label: 'Json' },
    { id: 'export-all-modal-text-checkbox', value: 'text', label: 'Text' },
  ];

  formatOptions.forEach((opt) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:center;';
    formatWrapper.appendChild(row);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = opt.id;
    cb.name = 'export-all-modal-checkbox';
    cb.value = opt.value;
    cb.checked = opt.value === 'text';
    cb.addEventListener('change', (ev) => {
      const { checked, value } = ev.target as HTMLInputElement;
      if (checked) {
        selectedFormats.push(value);
      } else {
        selectedFormats = selectedFormats.filter((f) => f !== value);
      }
      const copyBtn = document.querySelector('#export-all-modal-copy-button') as HTMLButtonElement;
      if (copyBtn) {
        copyBtn.style.opacity = conversationIds.length === 1 && selectedFormats.length === 1 ? '1' : '0.5';
        copyBtn.disabled = conversationIds.length !== 1 || selectedFormats.length !== 1;
      }
      const exportBtn = document.querySelector('#export-all-modal-export-button') as HTMLButtonElement;
      if (exportBtn) {
        exportBtn.style.opacity = selectedFormats.length === 0 ? '0.5' : '1';
        exportBtn.disabled = selectedFormats.length === 0;
      }
    });
    row.appendChild(cb);

    const label = document.createElement('label');
    label.htmlFor = opt.id;
    label.style.cssText = 'font-size:0.875rem;margin-left:8px;';
    label.textContent = opt.label;
    row.appendChild(label);
  });

  // Progress bar
  const progressLabel = document.createElement('div');
  progressLabel.id = 'export-all-modal-progress-bar-label';
  progressLabel.style.cssText = 'font-size:0.875rem;margin:32px auto 8px;';
  progressLabel.textContent = `0 / ${conversationIds?.length || '--'} `;
  body.appendChild(progressLabel);

  const progressBar = document.createElement('div');
  progressBar.id = 'export-all-modal-progress-bar';
  progressBar.style.minHeight = '12px';
  progressBar.classList.add(
    'bg-token-main-surface-tertiary',
    'relative',
    'w-full',
    'h-3',
    'rounded-md',
    'overflow-hidden',
  );
  body.appendChild(progressBar);

  const progressFill = document.createElement('div');
  progressFill.id = 'export-all-modal-progress-bar-fill';
  progressFill.style.cssText =
    'position:absolute;top:0px;left:0px;width:0%;height:12px;min-height:12px;background-color:gold;border-radius:4px;';
  progressBar.appendChild(progressFill);

  const progressFilename = document.createElement('div');
  progressFilename.id = 'export-all-modal-progress-bar-filename';
  progressFilename.style.cssText = 'font-size:0.875rem;margin:8px auto 32px;';
  progressFilename.classList.add('truncate', 'w-full', 'text-token-text-tertiary');
  progressFilename.textContent = ' ';
  body.appendChild(progressFilename);

  // Action buttons
  const actionBar = document.createElement('div');
  actionBar.classList.add('mt-auto', 'w-full', 'flex', 'items-center', 'justify-end', 'gap-2');
  body.appendChild(actionBar);

  // Include archived checkbox
  const archivedWrapper = document.createElement('div');
  archivedWrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;margin-right:auto;';
  actionBar.appendChild(archivedWrapper);

  const archivedCb = document.createElement('input');
  archivedCb.type = 'checkbox';
  archivedCb.id = 'export-all-modal-include-archived-checkbox';
  archivedCb.checked = true;
  archivedWrapper.appendChild(archivedCb);

  const archivedLabel = document.createElement('label');
  archivedLabel.htmlFor = archivedCb.id;
  archivedLabel.style.cssText = 'font-size:0.875rem;margin-left:8px;';
  archivedLabel.classList.add('text-token-text-tertiary');
  archivedLabel.textContent = translate('Include archived conversations');
  archivedWrapper.appendChild(archivedLabel);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.classList.add('btn', 'relative', 'btn-secondary');
  cancelBtn.textContent = translate('Cancel');
  cancelBtn.addEventListener('click', () => {
    exportAllCanceled = true;
    clearTimeout(exportTimeout);
    overlay.remove();
  });
  actionBar.appendChild(cancelBtn);

  // Copy to clipboard button
  const copyBtn = document.createElement('button');
  copyBtn.id = 'export-all-modal-copy-button';
  copyBtn.textContent = translate('Copy to clipboard');
  copyBtn.classList.add('btn', 'composer-submit-btn', 'composer-submit-button-color');
  copyBtn.style.opacity = conversationIds?.length !== 1 || selectedFormats.length !== 1 ? '0.5' : '1';
  copyBtn.disabled = conversationIds?.length !== 1 || selectedFormats?.length !== 1;
  copyBtn.addEventListener('click', () => {
    exportAllCanceled = false;
    copyBtn.disabled = true;
    document.querySelectorAll<HTMLInputElement>('input[name="export-all-modal-checkbox"]').forEach((cb) => {
      cb.disabled = true;
    });
    exportSelectedConversations(selectedFormats, conversationIds, 'copy');
  });
  actionBar.appendChild(copyBtn);

  // Save as PDF button
  const pdfBtn = document.createElement('button');
  pdfBtn.id = 'export-all-modal-pdf-button';
  pdfBtn.classList.add('btn', 'composer-submit-btn', 'composer-submit-button-color');
  pdfBtn.style.opacity = conversationIds?.length !== 1 ? '0.5' : '1';
  pdfBtn.disabled = conversationIds?.length !== 1;
  pdfBtn.textContent = translate('Save as PDF');
  pdfBtn.addEventListener('click', () => {
    saveConversationAsPDF(conversationIds[0]!);
  });
  actionBar.appendChild(pdfBtn);

  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.id = 'export-all-modal-export-button';
  exportBtn.classList.add('btn', 'relative', 'composer-submit-btn', 'composer-submit-button-color');
  exportBtn.style.opacity = conversationIds?.length === 0 || selectedFormats.length === 0 ? '0.5' : '1';
  exportBtn.textContent = translate('Export');
  exportBtn.disabled = conversationIds?.length === 0 || selectedFormats.length === 0;
  exportBtn.addEventListener('click', () => {
    exportAllCanceled = false;
    exportBtn.disabled = true;
    exportBtn.innerText = `${translate('Exporting')}...`;
    exportBtn.appendChild(loadingSpinner('export-all-modal-export-button'));
    document.querySelectorAll<HTMLInputElement>('input[name="export-all-modal-checkbox"]').forEach((cb) => {
      cb.disabled = true;
    });
    exportSelectedConversations(selectedFormats, conversationIds, 'export', folderName);
  });
  actionBar.appendChild(exportBtn);

  // If no IDs provided, fetch total count
  if (conversationIds?.length === 0) {
    chrome.runtime.sendMessage({ type: 'getTotalConversationsCount', forceRefresh: true }, (count: number) => {
      const c = count || 0;
      if (!c) progressLabel.textContent = "You don't have any conversations.";
      progressLabel.textContent = `0 / ${c} `;
      exportBtn.disabled = c === 0 || selectedFormats.length === 0;
      exportBtn.style.opacity = c === 0 || selectedFormats.length === 0 ? '0.5' : '1';
    });
  }

  document.body.appendChild(overlay);
}

function showMessageListInExportModal(): void {
  const el = document.querySelector('#export-all-modal-message-list-wrapper');
  el?.classList.remove('hidden');
}

function hideMessageListInExportModal(): void {
  const el = document.querySelector('#export-all-modal-message-list-wrapper');
  el?.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Export execution
// ---------------------------------------------------------------------------

/**
 * Export the selected conversations in the chosen formats as a ZIP file.
 */
export function exportSelectedConversations(
  formats: string[],
  conversationIds: string[] = [],
  action: ExportAction = 'export',
  folderLabel = '',
): void {
  const progressLabel = document.querySelector('#export-all-modal-progress-bar-label') as HTMLElement;
  const progressFill = document.querySelector('#export-all-modal-progress-bar-fill') as HTMLElement;
  const filenameLabel = document.querySelector('#export-all-modal-progress-bar-filename') as HTMLElement;
  const includeArchived = (document.querySelector('#export-all-modal-include-archived-checkbox') as HTMLInputElement)
    ?.checked;

  getSelectedConversations(conversationIds, includeArchived).then((conversations: any) => {
    if (conversations.error && conversations.error.type === 'limit') {
      errorUpgradeConfirmation(conversations.error);
      return;
    }

    const zip = new JSZip();
    const exportModeEl = document.querySelector(
      'input[name="export-all-modal-export-mode"]:checked',
    ) as HTMLInputElement | null;
    const exportMode = exportModeEl?.value || 'all';

    const processConversation = async (convId: string, mode: string) => {
      if (exportAllCanceled) return;

      const conv = await getConversationById(convId);
      const safeTitle = conv.title.replace(/[^a-zA-Z0-9]/g, '_');
      let currentNode: string | null = conv.current_node;

      const createDate = new Date(formatTime(conv.create_time));
      const dateStr = `${createDate.getFullYear()}-${createDate.getMonth() + 1}-${createDate.getDate()}`;
      const timeStr = `${createDate.getHours()}-${createDate.getMinutes()}-${createDate.getSeconds()}`;

      if (conv.is_archived) zip.folder('Archived');

      let messages: any[] = [];
      while (currentNode) {
        const node: { message?: unknown; parent?: string } =
          (conv.mapping as Record<string, { message?: unknown; parent?: string }>)[currentNode!] ?? {};
        if (node.message) messages.push(node.message);
        currentNode = node.parent ?? null;
      }

      if (mode === 'chatgpt') {
        messages = messages.filter((m: any) => m.author?.role === 'assistant');
      } else if (mode === 'selected') {
        const selectedIds = Array.from(
          document.querySelectorAll('input[name="export-all-modal-message-checkbox"]:checked'),
        ).map((cb) => (cb as HTMLInputElement).value);
        messages = messages.filter(
          (m: any) =>
            selectedIds.includes(m.id) ||
            selectedIds.some((id) =>
              document.querySelector(`main article[data-turn-id="${id}"] div[data-message-id="${m.id}"]`),
            ),
        );
      }

      const orderedMessages = messages.reverse();

      if (formats.includes('text')) {
        const textContent = orderedMessages
          .filter((m: any) => {
            const role = m?.author?.role;
            const contentType = m?.content?.content_type;
            const hasContent =
              contentType === 'thoughts'
                ? m?.content?.thoughts?.map((t: any) => t.content).join('')
                : m?.content?.parts?.join('');
            return hasContent && contentType !== 'user_editable_context' && (role === 'user' || role === 'assistant');
          })
          .map((m: any) => {
            const contentType = m?.content?.content_type;
            const parts =
              contentType === 'thoughts' ? m?.content?.thoughts?.map((t: any) => t.content) : m?.content?.parts;
            const label = contentType === 'thoughts' ? 'Thoughts' : m?.author?.role?.toUpperCase();
            const raw = (parts || [])
              .filter((p: any) => typeof p === 'string')
              .join('\n')
              .replace(/^## Instructions[\s\S]*?## End Instructions\n\n/m, '');
            return `${mode !== 'chatgpt' ? `>> ${label}: ` : ''}${replaceCitations(raw, m.metadata?.citations, 'text')}`;
          })
          .join('\n\n');

        const url = `https://chat.openai.com/c/${conv.conversation_id}\n\n`;
        const fullText = `# ${escapeHTML(conv.title)}\n\n${url}${textContent}\n\n`;

        zip.file(`${dateStr} ${timeStr}-${safeTitle}.${fileFormatConverter('text')}`, fullText);
        if (action === 'copy') copyToClipboard(textContent, 'text');
      }

      if (formats.includes('json')) {
        zip.file(`${dateStr} ${timeStr}-${safeTitle}.${fileFormatConverter('json')}`, JSON.stringify(conv));
        if (action === 'copy') copyToClipboard(JSON.stringify(conv), 'JSON');
      }

      if (formats.includes('markdown')) {
        const mdContent = orderedMessages
          .filter((m: any) => {
            const role = m?.author?.role;
            const contentType = m?.content?.content_type;
            const hasContent =
              contentType === 'thoughts'
                ? m?.content?.thoughts?.map((t: any) => t.content).join('')
                : m?.content?.parts?.join('');
            return hasContent && contentType !== 'user_editable_context' && (role === 'user' || role === 'assistant');
          })
          .map((m: any) => {
            const contentType = m?.content?.content_type;
            const parts =
              contentType === 'thoughts' ? m?.content?.thoughts?.map((t: any) => t.content) : m?.content?.parts;
            const label = contentType === 'thoughts' ? 'Thoughts' : m?.author?.role?.toUpperCase();
            const raw = (parts || [])
              .filter((p: any) => typeof p === 'string')
              .join('\n')
              .replace(/^## Instructions[\s\S]*?## End Instructions\n\n/m, '');
            return `${mode !== 'chatgpt' ? `## ${label}\n` : ''}${replaceCitations(raw, m.metadata?.citations, 'markdown')}`;
          })
          .join('\n\n');

        const url = `https://chat.openai.com/c/${conv.conversation_id}\n\n`;
        const fullMd = `# ${escapeHTML(conv.title)}\n\n${url}${mdContent}\n\n`;

        zip.file(`${dateStr} ${timeStr}-${safeTitle}.${fileFormatConverter('markdown')}`, fullMd);
        if (action === 'copy') copyToClipboard(mdContent, 'Markdown');
      }
    };

    // Process all conversations sequentially
    const ids = conversations.map ? conversations.map((c: any) => c.id || c.conversation_id) : conversationIds;
    const total = ids.length;
    let idx = 0;

    const processNext = async () => {
      if (idx >= total || exportAllCanceled) {
        if (!exportAllCanceled && action === 'export' && total > 0) {
          progressFill.style.width = '100%';
          progressLabel.textContent = `${total} / ${total}`;
          filenameLabel.textContent = 'Generating ZIP...';
          zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then((blob) => {
            saveAs(blob, `${new Date().toISOString().slice(0, 10)}-council-export.zip`);
            filenameLabel.textContent = 'Done!';
          });
        }
        return;
      }

      const convId = ids[idx];
      const exportMode =
        (document.querySelector('input[name="export-all-modal-export-mode"]:checked') as HTMLInputElement)?.value ||
        'all';

      if (progressLabel) progressLabel.textContent = `${idx + 1} / ${total}`;
      if (progressFill) progressFill.style.width = `${((idx + 1) / total) * 100}%`;
      if (filenameLabel) filenameLabel.textContent = convId;

      await processConversation(convId, exportMode);
      idx++;
      exportTimeout = setTimeout(processNext, 200);
    };

    processNext();
  });
}

// ---------------------------------------------------------------------------
// Splitter chain
// ---------------------------------------------------------------------------

/**
 * For very long text, generate a "splitter chain" that breaks the content
 * into manageable chunks with wrapping prompts.
 */
export async function generateSplitterChain(text: string): Promise<string[]> {
  // Read settings from cache
  const cachedSettings = (window as any).cachedSettings || {};
  const { autoSplit, autoSummarize, autoSplitLimit, autoSplitInitialPrompt, autoSplitChunkPrompt } = cachedSettings;

  if (!autoSplit || !autoSplitLimit || text.length < autoSplitLimit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  let chunkNum = 1;
  const totalChunks = Math.ceil(remaining.length / autoSplitLimit);

  while (remaining.length > autoSplitLimit) {
    const chunk = getChunk(
      remaining,
      autoSplitInitialPrompt,
      autoSplitChunkPrompt,
      autoSplitLimit,
      chunkNum,
      totalChunks,
    );
    if (!chunk) break;
    chunks.push(chunk);
    remaining = remaining.slice(autoSplitLimit);
    chunkNum++;
  }

  if (remaining.length > 0) {
    const chunk = getChunk(
      remaining,
      autoSplitInitialPrompt,
      autoSplitChunkPrompt,
      autoSplitLimit,
      chunkNum,
      totalChunks,
    );
    chunks.push(chunk);
  }

  if (autoSummarize) {
    chunks.push('Summarize all chunks');
  }

  return chunks;
}

function getChunk(
  text: string,
  initialPrompt: string,
  chunkPrompt: string,
  limit: number,
  chunkNum: number,
  totalChunks: number,
): string {
  let result = '';
  if (text.length === 0) return result;

  if (chunkNum === 1) {
    result = initialPrompt || '';
  }

  result += `[START CHUNK ${chunkNum} / ${totalChunks}]\n    ${text.slice(0, limit)}\n    [END CHUNK ${chunkNum}/${totalChunks}]\n    ${chunkPrompt || ''}`;
  return result;
}

// ---------------------------------------------------------------------------
// Copy/export helpers
// ---------------------------------------------------------------------------

/**
 * Save a single response message as PDF.
 */
export async function saveResponseAsPDF(messageId: string, conversationId: string): Promise<void> {
  const article = document
    .querySelector(`div[data-message-id="${messageId}"]`)
    ?.parentElement?.closest('article') as HTMLElement | null;
  if (article) {
    await saveConversationAsPDF(conversationId, article);
  }
}

/**
 * Copy message text to clipboard using the native copy button.
 */
export async function handleCopyText(messageId: string, _conversationId: string, addToNote = false): Promise<void> {
  const article = document.querySelector(`div[data-message-id="${messageId}"]`)?.parentElement?.closest('article');
  const copyBtn = article?.querySelector('[data-testid="copy-turn-action-button-original"]') as HTMLElement;
  copyBtn?.click();

  if (addToNote) {
    const text = await navigator.clipboard.readText();
    handleAddToNoteText(text);
  } else {
    toast('Copied to clipboard', 'success');
  }
}

/**
 * Copy message as rich HTML to clipboard.
 */
export async function handleCopyHtml(messageId: string, _conversationId: string, addToNote = false): Promise<void> {
  const container = document.querySelector(`div[data-message-id="${messageId}"]`)?.parentElement;
  const article = container?.closest('article');
  if (!container) return;

  let clone = container.cloneNode(true) as HTMLElement;
  clone = removeTimeStampCounterFromCopy(clone);

  const cachedSettings = (window as any).cachedSettings || {};
  const prevArticle = article?.previousElementSibling?.lastElementChild;
  if (cachedSettings.copyMode) {
    clone.innerHTML = `<div>USER:</div><div>${prevArticle?.textContent || ''}</div><br><div>ASSISTANT:</div>${clone.innerHTML}`;
  }

  copyRichText(clone);

  if (addToNote) {
    handleAddToNoteText(clone.innerHTML, 'as HTML');
  } else {
    toast('Copied to clipboard as HTML', 'success');
  }
}
