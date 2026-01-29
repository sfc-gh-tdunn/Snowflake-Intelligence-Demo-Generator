import React, { useState, useRef } from 'react';

function BrandSelectionPage({ brandData, onSelect, onBack }) {
  const [selectedLogo, setSelectedLogo] = useState(brandData?.logos?.[0]?.src || '');
  const [selectedColor, setSelectedColor] = useState(brandData?.colors?.[0]?.hex || '#29b5e8');
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const fileInputRef = useRef(null);

  // Handle custom logo file upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        return;
      }
      // Create a data URL for the uploaded image
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        setCustomLogoUrl(dataUrl);
        setSelectedLogo(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle custom color input
  const handleCustomColor = (e) => {
    const color = e.target.value;
    setSelectedColor(color);
  };

  const handleFinalize = () => {
    onSelect(selectedLogo, selectedColor);
  };

  return (
    <div className="page brand-selection-page">
      <div className="brand-selection-container">
        <div className="brand-selection-header">
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
          <h1>Select Your Brand Assets</h1>
        </div>

        <div className="brand-selection-content">
          {/* Brand Selection Column */}
          <div className="brand-assets-panel">
            {/* Logo Selection */}
            <div className="logo-selection">
              <h2>Select a Logo</h2>
              {brandData?.logos?.length > 0 ? (
                <div className="logo-grid">
                  {brandData.logos.map((logo, index) => (
                    <div
                      key={index}
                      className={`logo-option ${selectedLogo === logo.src ? 'selected' : ''}`}
                      onClick={() => setSelectedLogo(logo.src)}
                    >
                      <img src={logo.src} alt={`Logo ${index + 1}`} />
                      <span className="logo-type">{logo.type}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-logos">No logos found for this company.</p>
              )}
              
              {/* Custom Logo Upload */}
              <div className="custom-upload-section">
                <p className="upload-label">Or upload your own logo:</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoUpload}
                  accept="image/*"
                  className="file-input-hidden"
                  id="logo-upload"
                />
                <button 
                  className="upload-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                  </svg>
                  Upload Logo
                </button>
                {customLogoUrl && (
                  <div 
                    className={`logo-option custom-logo ${selectedLogo === customLogoUrl ? 'selected' : ''}`}
                    onClick={() => setSelectedLogo(customLogoUrl)}
                  >
                    <img src={customLogoUrl} alt="Custom uploaded logo" />
                    <span className="logo-type">Custom</span>
                  </div>
                )}
              </div>
            </div>

            {/* Color Selection */}
            <div className="color-selection">
              <h2>Select a Color</h2>
              {brandData?.colors?.length > 0 ? (
                <div className="color-grid">
                  {brandData.colors.map((color, index) => (
                    <div
                      key={index}
                      className={`color-option ${selectedColor === color.hex ? 'selected' : ''}`}
                      onClick={() => setSelectedColor(color.hex)}
                    >
                      <div
                        className="color-swatch"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="color-hex">{color.hex}</span>
                      <span className="color-type">{color.type}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="default-colors">
                  <p>No brand colors found. Select a default:</p>
                  <div className="color-grid">
                    {['#29b5e8', '#1a73e8', '#34a853', '#ea4335', '#fbbc04'].map(hex => (
                      <div
                        key={hex}
                        className={`color-option ${selectedColor === hex ? 'selected' : ''}`}
                        onClick={() => setSelectedColor(hex)}
                      >
                        <div
                          className="color-swatch"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="color-hex">{hex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Custom Color Picker */}
              <div className="custom-color-section">
                <p className="upload-label">Or choose your own color:</p>
                <div className="color-picker-wrapper">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={handleCustomColor}
                    className="color-picker-input"
                    id="custom-color"
                  />
                  <label htmlFor="custom-color" className="color-picker-button">
                    <div 
                      className="color-preview-swatch"
                      style={{ backgroundColor: selectedColor }}
                    />
                    <span className="color-picker-text">
                      {selectedColor.toUpperCase()}
                    </span>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M17.75 3c.966 0 1.75.784 1.75 1.75v14.5A1.75 1.75 0 0 1 17.75 21H6.25A1.75 1.75 0 0 1 4.5 19.25V4.75c0-.966.784-1.75 1.75-1.75h11.5zm0 1.5H6.25a.25.25 0 0 0-.25.25v14.5c0 .138.112.25.25.25h11.5a.25.25 0 0 0 .25-.25V4.75a.25.25 0 0 0-.25-.25zM12 6a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>
                    </svg>
                  </label>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="brand-preview">
              <h2>Preview</h2>
              <div
                className="preview-card"
                style={{ backgroundColor: selectedColor }}
              >
                {selectedLogo && (
                  <img src={selectedLogo} alt="Selected Logo" className="preview-logo" />
                )}
                <span className="preview-text">Your branded experience</span>
              </div>
            </div>

            <button className="finalize-button" onClick={handleFinalize}>
              Finalize Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BrandSelectionPage;

