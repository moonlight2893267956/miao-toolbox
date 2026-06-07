import React from 'react';

const LoginPage: React.FC = () => {
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
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>阿渺工具箱</h1>
        <p style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 32 }}>登录页面 (Story 1.9 实现)</p>
      </div>
    </div>
  );
};

export default LoginPage;
