import React, { useState } from 'react';

function BrandSelectionPage({ brandData, discoveryQuestions, onSelect, onBack }) {
  const [selectedLogo, setSelectedLogo] = useState(brandData?.logos?.[0]?.src || '');
  const [selectedColor, setSelectedColor] = useState(brandData?.colors?.[0]?.hex || '#29b5e8');
  
  // Format questions as numbered text for editing
  const formatQuestionsAsText = (questions) => {
    if (!questions || questions.length === 0) {
      return '1. \n2. \n3. \n4. \n5. ';
    }
    return questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  };
  
  const [questionsText, setQuestionsText] = useState(formatQuestionsAsText(discoveryQuestions));

  // Parse edited text back into array of questions
  const parseQuestionsFromText = (text) => {
    return text
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(q => q.length > 0);
  };

  const handleFinalize = () => {
    const editedQuestions = parseQuestionsFromText(questionsText);
    onSelect(selectedLogo, selectedColor, editedQuestions);
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
          {/* Discovery Questions Column */}
          <div className="discovery-questions-panel">
            <h2>Top 5 Discovery Questions</h2>
            <p className="questions-hint">Edit, reorder, or add questions below:</p>
            <textarea
              className="questions-textarea"
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
              placeholder="1. First question&#10;2. Second question&#10;3. Third question&#10;4. Fourth question&#10;5. Fifth question"
              rows={12}
            />
          </div>

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

