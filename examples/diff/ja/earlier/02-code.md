# コードの一部の変更

```python
def connect(host, port=8080):
    sock = socket.create_connection((host, port))
    sock.settimeout(5)
    return sock
```

コードの後ろの段落です。
