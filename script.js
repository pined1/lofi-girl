// Sound definitions with synthesis parameters
const sounds = [
    { id: 'rain', name: 'Cyber Rain', icon: '🌧️', type: 'noise', filter: 'lowpass' },
    { id: 'ocean', name: 'Neon Waves', icon: '🌊', type: 'pink-noise', filter: 'lowpass', modulation: 'ocean' },
    { id: 'wind', name: 'City Wind', icon: '💨', type: 'pink-noise', filter: 'bandpass' },
    { id: 'crickets', name: 'Night Bugs', icon: '🦗', type: 'oscillator', freq: 4000, modulation: 'pulse' },
    { id: 'drone', name: 'Deep Space', icon: '🚀', type: 'oscillator', freq: 50, wave: 'sawtooth' },
    { id: 'coffee', name: 'Café Hum', icon: '☕', type: 'noise', filter: 'highpass' },
    { id: 'vinyl', name: 'Vinyl Dust', icon: '💿', type: 'impulse', rate: 15 },
    { id: 'fire', name: 'Digital Fire', icon: '🔥', type: 'noise', filter: 'lowpass', modulation: 'flicker' },
    { id: 'chime', name: 'Glass Chimes', icon: '🎐', type: 'periodic', baseFreq: 440 },
    { id: 'train', name: 'Ghost Train', icon: '🚋', type: 'pink-noise', filter: 'lowpass', modulation: 'rhythm' },
];

let audioCtx;
let analyser;
const activeSounds = {};

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// White Noise buffer generator
function createNoiseBuffer() {
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

// Pink Noise (1/f) buffer generator - better for nature sounds
function createPinkNoiseBuffer() {
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168981;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        data[i] *= 0.11; // (roughly) compensate for gain
        b6 = white * 0.115926;
    }
    return buffer;
}

// Random impulse generator (for vinyl crackle)
function createImpulseBuffer(rate) {
    const bufferSize = audioCtx.sampleRate * 4; // 4 seconds loop
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    // Approximate number of pops per second
    const totalPops = rate * 4; 
    for (let i = 0; i < totalPops; i++) {
        const idx = Math.floor(Math.random() * bufferSize);
        data[idx] = (Math.random() * 2 - 1) * 0.8; // Pop amplitude
    }
    return buffer;
}

class SoundNode {
    constructor(config) {
        this.config = config;
        this.gainNode = audioCtx.createGain();
        this.gainNode.gain.value = 0.5;
        this.source = null;
        this.filter = null;
        this.lfo = null;
        this.lfoGain = null;
        this.isPlaying = false;
    }

    start() {
        if (this.isPlaying) return;
        
        // Source creation
        if (this.config.type === 'noise') {
            this.source = audioCtx.createBufferSource();
            this.source.buffer = createNoiseBuffer();
            this.source.loop = true;
        } else if (this.config.type === 'pink-noise') {
            this.source = audioCtx.createBufferSource();
            this.source.buffer = createPinkNoiseBuffer();
            this.source.loop = true;
        } else if (this.config.type === 'impulse') {
            this.source = audioCtx.createBufferSource();
            this.source.buffer = createImpulseBuffer(this.config.rate || 5);
            this.source.loop = true;
        } else if (this.config.type === 'oscillator') {
            this.source = audioCtx.createOscillator();
            this.source.type = this.config.wave || 'sine';
            this.source.frequency.value = this.config.freq || 440;
            
            if (this.config.modulation === 'pulse') {
                // For crickets: fast AM modulation
                this.lfo = audioCtx.createOscillator();
                this.lfo.type = 'square';
                this.lfo.frequency.value = 4; // Chirps per second
                this.lfoGain = audioCtx.createGain();
                this.lfoGain.gain.value = 1; // Full depth
                
                // Connect LFO to a gain node that modulates the source volume
                const amGain = audioCtx.createGain();
                amGain.gain.value = 0;
                this.source.connect(amGain);
                this.lfo.connect(amGain.gain);
                this.lfo.start();
                
                // Re-route source through AM gain
                this.source.disconnect(); // Safety
                // This part is tricky, let's simplify:
                // Source -> AMGain -> Filter/MainGain
                // LFO -> AMGain.gain
            }
        }

        // Filter chain
        let outputNode = this.source;

        if (this.config.filter) {
            this.filter = audioCtx.createBiquadFilter();
            if (this.config.filter === 'lowpass') {
                this.filter.type = 'lowpass';
                this.filter.frequency.value = 400;
            } else if (this.config.filter === 'bandpass') {
                this.filter.type = 'bandpass';
                this.filter.frequency.value = 500;
                this.filter.Q.value = 1;
            } else if (this.config.filter === 'highpass') {
                this.filter.type = 'highpass';
                this.filter.frequency.value = 800;
            }
            
            // Modulation logic
            if (this.config.modulation === 'ocean') {
                // Slow sweeping lowpass for waves
                this.filter.frequency.value = 300;
                this.lfo = audioCtx.createOscillator();
                this.lfo.frequency.value = 0.1; // 10s wave cycle
                this.lfoGain = audioCtx.createGain();
                this.lfoGain.gain.value = 300; // Sweep range
                this.lfo.connect(this.lfoGain);
                this.lfoGain.connect(this.filter.frequency);
                this.lfo.start();
            } else if (this.config.modulation === 'flicker') {
                // Random filter modulation for fire
                // Simple LFO isn't random enough, but low freq noise is hard
                // We'll simulate with a fast LFO for now
                this.lfo = audioCtx.createOscillator();
                this.lfo.frequency.value = 15; 
                this.lfoGain = audioCtx.createGain();
                this.lfoGain.gain.value = 100;
                this.lfo.connect(this.lfoGain);
                this.lfoGain.connect(this.filter.frequency);
                this.lfo.start();
            } else if (this.config.modulation === 'rhythm') {
                 // Train chug: fast modulation of filter or gain
                 this.lfo = audioCtx.createOscillator();
                 this.lfo.type = 'sawtooth';
                 this.lfo.frequency.value = 4; 
                 this.lfoGain = audioCtx.createGain();
                 this.lfoGain.gain.value = 200;
                 this.lfo.connect(this.lfoGain);
                 this.lfoGain.connect(this.filter.frequency);
                 this.lfo.start();
            }

            // Special handling for AM modulation (Crickets) which already disconnected source
            if (this.config.modulation === 'pulse' && this.config.type === 'oscillator') {
                // Re-create the chain for Pulse
                const amGain = audioCtx.createGain();
                this.source.connect(amGain);
                this.lfo = audioCtx.createOscillator();
                this.lfo.type = 'square';
                this.lfo.frequency.value = 4; // Chirps/sec
                this.lfo.connect(amGain.gain);
                this.lfo.start();
                
                amGain.connect(this.filter);
            } else {
                this.source.connect(this.filter);
            }
            
            outputNode = this.filter;
        } else {
             if (this.config.modulation === 'pulse' && this.config.type === 'oscillator') {
                 const amGain = audioCtx.createGain();
                 this.source.connect(amGain);
                 this.lfo = audioCtx.createOscillator();
                 this.lfo.type = 'square';
                 this.lfo.frequency.value = 4;
                 this.lfo.connect(amGain.gain);
                 this.lfo.start();
                 outputNode = amGain;
             }
        }

        outputNode.connect(this.gainNode);
        this.gainNode.connect(analyser); // Main mix bus
        this.source.start();
        this.isPlaying = true;
    }

    stop() {
        if (!this.isPlaying) return;
        
        const stopTime = audioCtx.currentTime + 0.1;
        this.gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
        
        setTimeout(() => {
            if (this.source) {
                try { this.source.stop(); } catch(e){}
                this.source.disconnect();
            }
            if (this.lfo) {
                try { this.lfo.stop(); } catch(e){}
                this.lfo.disconnect();
            }
            this.isPlaying = false;
        }, 150);
    }

    setVolume(val) {
        this.gainNode.gain.setTargetAtTime(val, audioCtx.currentTime, 0.1);
    }
}

function createUI() {
    const grid = document.getElementById('sound-grid');
    grid.innerHTML = ''; // Clear existing
    
    sounds.forEach(sound => {
        const card = document.createElement('div');
        card.className = 'sound-card';
        card.id = `card-${sound.id}`;
        
        card.innerHTML = `
            <div class="sound-icon">${sound.icon}</div>
            <h3>${sound.name}</h3>
            <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="0.5">
        `;

        const slider = card.querySelector('.volume-slider');
        
        // Prevent card click when dragging slider
        slider.addEventListener('click', (e) => e.stopPropagation());
        // Touch events for mobile slider dragging
        slider.addEventListener('touchstart', (e) => e.stopPropagation()); 

        slider.addEventListener('input', (e) => {
            if (activeSounds[sound.id]) {
                activeSounds[sound.id].setVolume(parseFloat(e.target.value));
            }
        });

        card.addEventListener('click', () => {
            initAudio();
            card.classList.toggle('active');
            
            if (!activeSounds[sound.id]) {
                activeSounds[sound.id] = new SoundNode(sound);
            }

            if (card.classList.contains('active')) {
                activeSounds[sound.id].start();
                activeSounds[sound.id].setVolume(parseFloat(slider.value));
            } else {
                activeSounds[sound.id].stop();
                // Clean up object reference after stop to allow fresh start
                setTimeout(() => {
                     if(!card.classList.contains('active')) activeSounds[sound.id] = null;
                }, 200);
            }
        });

        grid.appendChild(card);
    });
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    createUI();
    setupVisualizer();
});

function setupVisualizer() {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function draw() {
        requestAnimationFrame(draw);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const baseRadius = Math.min(centerX, centerY) * 0.4;

        ctx.beginPath();
        for (let i = 0; i < bufferLength; i++) {
            const value = dataArray[i];
            // Smoother visualization mapping
            const barHeight = Math.pow(value / 255, 2) * 150; 
            const rad = (i / bufferLength) * 2 * Math.PI;
            
            // Outer ring
            const x = centerX + Math.cos(rad) * (baseRadius + barHeight);
            const y = centerY + Math.sin(rad) * (baseRadius + barHeight);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffcc';
        ctx.stroke();
        
        // Inner ring (mirrored)
        ctx.beginPath();
        for (let i = 0; i < bufferLength; i++) {
            const value = dataArray[i];
            const barHeight = Math.pow(value / 255, 2) * 100;
            const rad = (i / bufferLength) * 2 * Math.PI;
            
            const x = centerX + Math.cos(rad) * (baseRadius - barHeight);
            const y = centerY + Math.sin(rad) * (baseRadius - barHeight);
             if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff00ff';
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    draw();
}
