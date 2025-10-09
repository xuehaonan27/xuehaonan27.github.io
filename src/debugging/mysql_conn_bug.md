# MySQL Connection Bug
On Ubuntu, install MySQL with `apt install mysql-server`, and `root` user could authenticate with `auth_socket` plugin and enable local cmdline login without password, but application could not access. Here's the solving.

## Step 1：modify MySQL root user auth method
1. Login to MySQL (No password needed)
   ```shell
   sudo mysql -u root
   ```
2. Check root user authentication method
   ```sql
   SELECT user, plugin, host FROM mysql.user WHERE user = 'root';
   ```
   If the `plugin` column displays `auth_socket`, you need to change it to password authentication.
3. Change the authentication method and set a password
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'yourpassword';
   FLUSH PRIVILEGES;
   ```
   Replace `yourpassword` with a secure password
4. Exit MySQL
   ```sql
   exit
   ```

### Step 2：add password in Flask configuration
Modify the database configuration and add the `password` field:
```python
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'yourpassword',  # Add here
    'database': 'TreeHole',
    'charset': 'utf8mb4',
    'cursorclass': DictCursor
}
```

### Step 3: Ensure the database and permissions are correct
1. Confirm that the database exists
   ```shell
   sudo mysql -u root -p -e "SHOW DATABASES;"
   ```
   After entering the password, check if `TreeHole` exists (That's my database). If not, create it:
   ```sql
   CREATE DATABASE TreeHole;
   ```
2. Grant permissions (usually root already has permissions, optional step)
   ```sql
   GRANT ALL PRIVILEGES ON TreeHole.* TO 'root'@'localhost';
   FLUSH PRIVILEGES;
   ```

## Step 4: Restart the MySQL service
```shell
sudo systemctl restart mysql
```

## Verify the connection
Test the connection via the command line using the configured password:
```shell
mysql -u root -p<yourpassword> -D TreeHole
```
If you successfully log in, the configuration is correct. The Flask application should be able to connect normally.

## Other possible issues
- Database does not exist: Confirm that the `TreeHole` database has been created.
- Firewall/SELinux restrictions: Local connections typically don't have this issue, but you can check the relevant settings.
- PyMySQL version issue: Ensure you are using the latest version of `pymysql`. Update with the command:
```shell
pip install --upgrade pymysql
```
