import React, { useState } from 'react';
import FormPage from './components/FormPage';
import BrandSelectionPage from './components/BrandSelectionPage';
import ChatPage from './components/ChatPage';
import { logDemoUsage } from './services/sqlStatement';

function App() {
  const [currentPage, setCurrentPage] = useState('form');
  const [formData, setFormData] = useState({
    name: '',
    companyUrl: '',
    mainVertical: '',
    subVertical: '',
    teamMembers: '',
    useCases: '',
    recordsPerTable: 1000
  });
  const [brandData, setBrandData] = useState(null);
  const [selectedLogo, setSelectedLogo] = useState('');
  const [selectedColor, setSelectedColor] = useState('#29b5e8');
  const [discoveryQuestions, setDiscoveryQuestions] = useState([]);
  const [customDataResult, setCustomDataResult] = useState(null);

  const handleFormSubmit = (data, brand, questions, customData = null) => {
    setFormData(data);
    setBrandData(brand);
    setDiscoveryQuestions(questions);
    setCustomDataResult(customData);
    setCurrentPage('brand');
  };

  const handleBrandSelect = (logo, color) => {
    setSelectedLogo(logo);
    setSelectedColor(color);
    setCurrentPage('chat');
    
    // Log demo usage to Snowflake (fire and forget - don't block navigation)
    logDemoUsage({
      name: formData.name,
      companyUrl: formData.companyUrl,
      vertical: formData.mainVertical,
      subVertical: formData.subVertical,
    });
  };

  const handleStartOver = () => {
    setCurrentPage('form');
    setFormData({
      name: '',
      companyUrl: '',
      mainVertical: '',
      subVertical: '',
      teamMembers: '',
      useCases: '',
      recordsPerTable: 1000
    });
    setBrandData(null);
    setSelectedLogo('');
    setSelectedColor('#29b5e8');
    setDiscoveryQuestions([]);
    setCustomDataResult(null);
  };

  return (
    <div className="app">
      {currentPage === 'form' && (
        <FormPage onSubmit={handleFormSubmit} initialData={formData} />
      )}
      {currentPage === 'brand' && (
        <BrandSelectionPage
          brandData={brandData}
          onSelect={handleBrandSelect}
          onBack={() => setCurrentPage('form')}
        />
      )}
      {currentPage === 'chat' && (
        <ChatPage
          logoUrl={selectedLogo}
          brandColor={selectedColor}
          mainVertical={formData.mainVertical}
          subVertical={formData.subVertical}
          discoveryQuestions={discoveryQuestions}
          customDataResult={customDataResult}
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}

export default App;

