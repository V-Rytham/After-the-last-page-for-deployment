import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, Undo, Check, Info } from 'lucide-react';
import './WizardMerch.css';

// Mock chat responses for the Wizard
const wizardResponses = [
  "I sense you want something cosmic. Let me weave some starlight into that dark fabric...",
  "Intriguing choice. A subtle quote from Chapter 4 would fit perfectly on the back.",
  "Consider it done. I've adjusted the color palette to match the melancholic undertones of the book.",
  "Magic applied! How does this alignment look to you?"
];

export default function WizardMerch() {
  const [messages, setMessages] = useState([
    { sender: 'wizard', text: "Welcome to the forge. I am Wizard. Tell me, which book universe are we bringing into reality today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Customization State
  const [merchType, setMerchType] = useState('tshirt'); // 'tshirt', 'hoodie', 'totebag'
  const [merchColor, setMerchColor] = useState('#1c1c21');

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Add user message
    const newMsg = { sender: 'user', text: input };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate Wizard thinking and responding
    setTimeout(() => {
      const resp = wizardResponses[Math.floor(Math.random() * wizardResponses.length)];
      setMessages(prev => [...prev, { sender: 'wizard', text: resp }]);
      
      // Randomly change a mockup property to simulate AI action
      const colors = ['#1c1c21', '#f5f5f7', '#3b0764', '#064e3b', '#7f1d1d'];
      setMerchColor(colors[Math.floor(Math.random() * colors.length)]);
      
      setIsTyping(false);
    }, 1500 + Math.random() * 1000); // 1.5 - 2.5s delay
  };

  return (
    <div className="wizard-page animate-fade-in">
      <div className="wizard-info-bar" role="status" aria-live="polite">
        <Info size={16} />
        <span>This feature isn’t ready yet — the Merch Wizard is currently a preview.</span>
      </div>

      <div className="wizard-header">
         <div className="flex-center-gap">
           <Sparkles className="text-accent" size={28} />
           <h1 className="font-serif">The Merch Wizard</h1>
         </div>
         <p className="text-muted text-center max-w-lg mt-2 mx-auto">
           Describe your vision. The Wizard will generate a unique design and apply it to premium apparel, shipped directly to you.
         </p>
      </div>

      <div className="wizard-workspace">
        {/* Left: 3D/2D Mockup Preview */}
        <div className="mockup-panel glass-panel">
          <div className="mockup-controls">
            <div className="control-group">
               <button className={`type-btn ${merchType === 'tshirt' ? 'active' : ''}`} onClick={() => setMerchType('tshirt')}>T-Shirt</button>
               <button className={`type-btn ${merchType === 'hoodie' ? 'active' : ''}`} onClick={() => setMerchType('hoodie')}>Hoodie</button>
               <button className={`type-btn ${merchType === 'totebag' ? 'active' : ''}`} onClick={() => setMerchType('totebag')}>Tote</button>
            </div>
            <div className="control-group">
               <input type="color" value={merchColor} onChange={e => setMerchColor(e.target.value)} className="color-picker" title="Base Color" />
            </div>
          </div>

          <div className="mockup-display" style={{ backgroundColor: merchColor }}>
             {/* Simulated Merchandise Shape */}
             <div className={`merch-shape ${merchType}`}>
               {/* Simulated Generated Graphic */}
               <div className="generated-graphic">
                 <Sparkles size={48} className="graphic-icon" />
                 <span className="graphic-text font-serif">A.T.L.P.</span>
               </div>
             </div>
             
             <div className="mockup-overlay shadow-inner" />
          </div>

          <div className="mockup-footer">
             <button className="btn-secondary sm"><Undo size={16}/> Revert</button>
             <button className="btn-primary sm"><Check size={16}/> Finalize & Order</button>
          </div>
        </div>

        {/* Right: AI Chat Interface */}
        <div className="chat-panel glass-panel">
           <div className="chat-header">
             <div className="wizard-avatar">
                <Bot size={24} className="text-white" />
             </div>
             <div>
               <h3 className="font-serif">Wizard AI</h3>
               <span className="status-indicator">Online & Ready</span>
             </div>
           </div>
           
           <div className="chat-history">
              {messages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble-wrapper ${msg.sender}`}>
                   {msg.sender === 'wizard' && <div className="mini-avatar"><Sparkles size={12}/></div>}
                   <div className="chat-bubble">
                     {msg.text}
                   </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="chat-bubble-wrapper wizard">
                   <div className="mini-avatar"><Sparkles size={12}/></div>
                   <div className="chat-bubble typing-indicator">
                     <span>.</span><span>.</span><span>.</span>
                   </div>
                </div>
              )}
              <div ref={messagesEndRef} />
           </div>

           <div className="chat-input-container">
             <input 
               type="text" 
               className="wizard-input" 
               placeholder="Example: Make it dark academia with gold accents..."
               value={input}
               onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && handleSend()}
             />
             <button className="wizard-send-btn" onClick={handleSend} disabled={!input.trim() || isTyping}>
                <Send size={18} />
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
