import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const signingKey = searchParams.get('signingKey');
    const username = searchParams.get('username');
    const role = searchParams.get('role');

    if (token) {
      localStorage.setItem('accessToken', token);
      if (signingKey) localStorage.setItem('signingKey', signingKey);
      if (username) localStorage.setItem('user', JSON.stringify({ username, role }));
      navigate('/tools', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
    }}>
      <p>正在处理登录...</p>
    </div>
  );
};

export default OAuthCallback;
