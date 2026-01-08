import React, { useState } from 'react';
import FormPage from './components/FormPage';
import BrandSelectionPage from './components/BrandSelectionPage';
import ChatPage from './components/ChatPage';

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

  const handleFormSubmit = (data, brand, questions) => {
    setFormData(data);
    setBrandData(brand);
    setDiscoveryQuestions(questions);
    setCurrentPage('brand');
  };

  const handleBrandSelect = (logo, color, editedQuestions) => {
    setSelectedLogo(logo);
    setSelectedColor(color);
    // Update discovery questions with any edits made by the user
    if (editedQuestions) {
      setDiscoveryQuestions(editedQuestions);
    }
    setCurrentPage('chat');
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
  };

  return (
    <div className="app">
      {currentPage === 'form' && (
        <FormPage onSubmit={handleFormSubmit} initialData={formData} />
      )}
      {currentPage === 'brand' && (
        <BrandSelectionPage
          brandData={brandData}
          discoveryQuestions={discoveryQuestions}
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
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}

export default App;

