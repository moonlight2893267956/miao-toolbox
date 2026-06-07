import React from 'react';

const RegisterPage: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: 24,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        padding: 40,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>注册</h1>
      </div>
    </div>
  );
};

export default RegisterPage;
