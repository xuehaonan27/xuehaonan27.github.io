---
layout: post
title: 连接Mysql出现的问题。
date: 2025-03-03
---

在Ubuntu上使用`apt install mysql-server`安装MySQL后，默认情况下`root`用户可能使用`auth_socket`插件进行身份验证，这允许通过本地命令行无密码登录，但应用程序无法通过此方式连接。以下是逐步解决方案：

### 步骤 1：修改MySQL root用户的认证方式
1. **登录MySQL**（无需密码）：
   ```bash
   sudo mysql -u root
   ```

2. **查看root用户的认证方式**：
   ```sql
   SELECT user, plugin, host FROM mysql.user WHERE user = 'root';
   ```
   若`plugin`列显示`auth_socket`，需更改为密码认证。

3. **更改认证方式并设置密码**：
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '你的密码';
   FLUSH PRIVILEGES;
   ```
   替换`你的密码`为安全密码。

4. **退出MySQL**：
   ```sql
   exit
   ```

### 步骤 2：在Flask配置中添加密码
修改数据库配置，添加`password`字段：
```python
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '你的密码',  # 添加此处
    'database': 'TreeHole',
    'charset': 'utf8mb4',
    'cursorclass': DictCursor
}
```

### 步骤 3：确保数据库和权限正确
1. **确认数据库存在**：
   ```bash
   sudo mysql -u root -p -e "SHOW DATABASES;"
   ```
   输入密码后，检查`TreeHole`是否存在。若不存在，需创建：
   ```sql
   CREATE DATABASE TreeHole;
   ```

2. **授予权限（通常root已有权限，可选步骤）**：
   ```sql
   GRANT ALL PRIVILEGES ON TreeHole.* TO 'root'@'localhost';
   FLUSH PRIVILEGES;
   ```

### 步骤 4：重启MySQL服务
```bash
sudo systemctl restart mysql
```

### 验证连接
使用配置的密码通过命令行测试连接：
```bash
mysql -u root -p你的密码 -D TreeHole
```
成功进入则表示配置正确。此时Flask应用应能正常连接。

### 其他可能问题
• **数据库不存在**：确认`TreeHole`数据库已创建。
• **防火墙/SELinux限制**：本地连接通常无此问题，但可检查相关设置。
• **PyMySQL版本问题**：确保使用最新版本`pymysql`，更新命令：
  ```bash
  pip install --upgrade pymysql
  ```

完成以上步骤后，你的Flask应用应能成功连接到MySQL数据库。