# Windows / SQL Server 2022 — Supabase ODBC 連線設定

## 1. 安裝 psqlODBC 驅動程式

1. 到 https://www.postgresql.org/ftp/odbc/versions/msi/ 下載最新 `psqlodbc_xx_xx_xxxx-x64.zip`
2. 解壓縮並執行 `.msi` 安裝程式（選 64-bit，因為 SQL Server 2022 是 64-bit process）

## 2. 建立 ODBC DSN

開啟 **ODBC Data Sources (64-bit)**（不是 32-bit 版本）

→ 「系統 DSN」分頁 → 「新增」→ 選 `PostgreSQL Unicode(x64)` → 填入：

| 欄位 | 值 |
|------|----|
| Data Source | `Supabase_TradingJournal` |
| Database | `postgres` |
| Server | `db.bynnmxospdnfnnlaqqzi.supabase.co` |
| Port | `5432` |
| User Name | `postgres` |
| Password | *(Supabase 後台 → Settings → Database → Database Password)* |
| SSL Mode | `require` |

按「Test」確認連線成功。

## 3. 在 SQL Server 建立 Linked Server

用 SSMS 執行以下 SQL：

```sql
EXEC sp_addlinkedserver
    @server     = N'SUPABASE_TJ',
    @srvproduct = N'PostgreSQL',
    @provider   = N'MSDASQL',
    @datasrc    = N'Supabase_TradingJournal';  -- 對應上面 DSN 名稱

EXEC sp_addlinkedsrvlogin
    @rmtsrvname  = N'SUPABASE_TJ',
    @useself     = N'FALSE',
    @rmtuser     = N'postgres',
    @rmtpassword = N'你的 Supabase DB 密碼';
```

## 4. 測試查詢

```sql
-- 查交易記錄
SELECT * FROM OPENQUERY(SUPABASE_TJ, '
  SELECT id, symbol, direction, status, entry_date, entry_price, net_pnl
  FROM public.trades
  ORDER BY entry_date DESC
  LIMIT 50
');

-- 查損益統計
SELECT * FROM OPENQUERY(SUPABASE_TJ, '
  SELECT
    status,
    COUNT(*) AS total,
    SUM(net_pnl) AS total_pnl,
    AVG(net_pnl) AS avg_pnl
  FROM public.trades
  GROUP BY status
');

-- 查日誌
SELECT * FROM OPENQUERY(SUPABASE_TJ, '
  SELECT journal_date, title, market_bias, mood
  FROM public.journals
  ORDER BY journal_date DESC
  LIMIT 20
');
```

## 5. 常見問題

| 問題 | 解決方式 |
|------|----------|
| `Provider 'MSDASQL' is not registered` | 確認用 64-bit ODBC，且 SQL Server 啟用了 `Ad Hoc Distributed Queries`：`EXEC sp_configure 'Ad Hoc Distributed Queries', 1; RECONFIGURE;` |
| SSL 連線失敗 | 確認 SSL Mode 設為 `require`，也可試 `verify-ca` |
| 認證失敗 | 密碼是 Supabase Database Password（不是登入帳號密碼） |
| 資料型態轉換錯誤 | PostgreSQL `uuid` → SQL Server 用 `nvarchar(36)` 接收；`timestamptz` 用 `datetimeoffset` |

## 6. Supabase 連線資訊摘要

```
Host:     db.bynnmxospdnfnnlaqqzi.supabase.co
Port:     5432
Database: postgres
User:     postgres
SSL:      required
```
