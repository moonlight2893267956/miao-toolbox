import React, { useState } from 'react';
import { Tooltip, Drawer } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNotification } from '../../contexts/NotificationContext';
import NotificationPanel from './NotificationPanel';

interface NotificationBellProps {
  collapsed?: boolean;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ collapsed }) => {
  const { unreadCount, pollError } = useNotification();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 铃铛按钮
  const bellButton = (
    <button
      className={`miao-user-card-btn miao-notification-bell${pollError ? ' miao-notification-bell-error' : ''}`}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!pollError) setDrawerOpen(true);
      }}
      aria-label={`消息通知${unreadCount > 0 ? `，${unreadCount}条未读` : ''}`}
    >
      <BellOutlined />
      {unreadCount > 0 && !pollError && (
        <span className="miao-bell-dot" aria-hidden="true" />
      )}
    </button>
  );

  // 轮询失败：铃铛变灰，无面板
  if (pollError) {
    return (
      <Tooltip
        title="消息获取失败"
        placement="right"
        overlayClassName="miao-nav-item-tooltip"
      >
        {bellButton}
      </Tooltip>
    );
  }

  // 折叠态：Tooltip 提示 + Drawer
  if (collapsed) {
    return (
      <>
        <Tooltip
          title="消息通知"
          placement="right"
          overlayClassName="miao-nav-item-tooltip"
        >
          {bellButton}
        </Tooltip>
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="right"
          width={600}
          closable={false}
          maskClosable
          rootClassName="miao-notification-drawer"
          styles={{
            wrapper: { position: 'fixed' },
            body: { padding: 0 },
          }}
        >
          <NotificationPanel open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </Drawer>
      </>
    );
  }

  // 展开态：Drawer
  return (
    <>
      {bellButton}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        width={600}
        closable={false}
        maskClosable
        rootClassName="miao-notification-drawer"
        styles={{
          wrapper: { position: 'absolute' },
          body: { padding: 0 },
        }}
      >
        <NotificationPanel open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </Drawer>
    </>
  );
};

export default NotificationBell;
