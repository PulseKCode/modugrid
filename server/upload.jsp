<%--
  ══════════════════════════════════════════════════════════════════════════
  upload.jsp — Sample receiver for ModuGrid imageMode:'upload'

  Request  : POST multipart/form-data, part name 'file'
  Response : {"ok":true,"id":123,"url":"/upload/2026/08/abc.png","name":"original.png"}
             {"ok":false,"message":"..."}

  Client configuration
    options: {
      imageMode: 'upload',
      imageMaxSize: 5*1024*1024,
      imageUpload: async (file, row) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('rowId', row.id);
        const r = await fetch('upload.jsp', { method:'POST', body: fd });
        const j = await r.json();
        if (!j.ok) throw new Error(j.message);
        return { id: j.id, url: j.url };      // only these values are kept in the grid
      }
    }

  Requires : commons-fileupload + commons-io (WEB-INF/lib)
             On Servlet 3.0+ you can use request.getPart() instead.

  -- Example DDL ----------------------------------------------------------
  CREATE TABLE ATTACH_FILE (
    ID        NUMBER PRIMARY KEY,
    ORIG_NM   VARCHAR2(260) NOT NULL,   -- original file name
    SAVE_PATH VARCHAR2(500) NOT NULL,   -- storage path on the server (relative)
    FILE_SIZE NUMBER,
    MIME_TYPE VARCHAR2(100),
    USE_YN    CHAR(1) DEFAULT 'N',      -- set to 'Y' once submit succeeds (lets a batch purge orphans)
    REG_DT    DATE DEFAULT SYSDATE
  );
  CREATE SEQUENCE SEQ_ATTACH_FILE START WITH 1 INCREMENT BY 1 NOCACHE;
  ------------------------------------------------------------------------
--%>
<%@ page contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" session="false" %>
<%@ page import="java.io.*, java.sql.*, java.util.*, java.text.SimpleDateFormat" %>
<%@ page import="javax.sql.DataSource, javax.naming.InitialContext" %>
<%@ page import="org.apache.commons.fileupload.*, org.apache.commons.fileupload.disk.*, org.apache.commons.fileupload.servlet.*" %>
<%@ page import="org.json.JSONObject" %>
<%!
  private static final String DS_NAME  = "java:comp/env/jdbc/oraDS";
  private static final String BASE_DIR = "/data/upload";           // storage root on the server
  private static final long   MAX_SIZE = 5L * 1024 * 1024;         // 5MB
  private static final Set<String> ALLOW_EXT =
      new HashSet<String>(Arrays.asList("jpg","jpeg","png","gif","webp","bmp"));

  private String ext(String name){
    int i = (name == null) ? -1 : name.lastIndexOf('.');
    return (i < 0) ? "" : name.substring(i + 1).toLowerCase();
  }
  /* Block path traversal — the original file name is never used in the storage path */
  private String safeName(String name){
    if (name == null) return "unknown";
    name = name.replace('\\', '/');
    int i = name.lastIndexOf('/');
    if (i >= 0) name = name.substring(i + 1);
    return name.length() > 255 ? name.substring(name.length() - 255) : name;
  }
%>
<%
  request.setCharacterEncoding("UTF-8");
  response.setHeader("Cache-Control", "no-store");

  JSONObject out = new JSONObject();
  Connection con = null;
  File saved = null;

  try {
    if (!ServletFileUpload.isMultipartContent(request))
      throw new IllegalArgumentException("not a multipart request");

    DiskFileItemFactory factory = new DiskFileItemFactory();
    factory.setSizeThreshold(1024 * 256);
    ServletFileUpload upload = new ServletFileUpload(factory);
    upload.setFileSizeMax(MAX_SIZE);
    upload.setHeaderEncoding("UTF-8");

    FileItem target = null;
    for (Object o : upload.parseRequest(request)) {
      FileItem it = (FileItem) o;
      if (!it.isFormField() && "file".equals(it.getFieldName())) { target = it; break; }
    }
    if (target == null) throw new IllegalArgumentException("missing 'file' part");

    String orig = safeName(target.getName());
    String e    = ext(orig);
    if (!ALLOW_EXT.contains(e))       throw new IllegalArgumentException("file type not allowed: " + e);
    if (target.getSize() > MAX_SIZE)  throw new IllegalArgumentException("file is too large");
    if (target.getSize() <= 0)        throw new IllegalArgumentException("file is empty");

    /* Storage path: /BASE_DIR/yyyy/MM/UUID.ext — the original name is kept in the DB only */
    String ym  = new SimpleDateFormat("yyyy/MM").format(new java.util.Date());
    File   dir = new File(BASE_DIR, ym);
    if (!dir.exists() && !dir.mkdirs()) throw new IOException("failed to create the upload directory");

    String saveNm = UUID.randomUUID().toString().replace("-", "") + "." + e;
    saved = new File(dir, saveNm);
    target.write(saved);

    String relPath = "/" + ym + "/" + saveNm;

    /* Register in the DB with USE_YN='N', then flip it to 'Y' once submit succeeds.
       (If the save is cancelled, rows left at 'N' are cleaned up by a batch job) */
    DataSource ds = (DataSource) new InitialContext().lookup(DS_NAME);
    con = ds.getConnection();
    con.setAutoCommit(false);

    long newId;
    PreparedStatement ps = con.prepareStatement(
        "INSERT INTO ATTACH_FILE (ID, ORIG_NM, SAVE_PATH, FILE_SIZE, MIME_TYPE, USE_YN) " +
        "VALUES (SEQ_ATTACH_FILE.NEXTVAL, ?, ?, ?, ?, 'N')", new String[]{"ID"});
    try {
      ps.setString(1, orig);
      ps.setString(2, relPath);
      ps.setLong(3, target.getSize());
      ps.setString(4, target.getContentType());
      ps.executeUpdate();
      ResultSet gk = ps.getGeneratedKeys();
      try { gk.next(); newId = gk.getLong(1); } finally { gk.close(); }
    } finally { ps.close(); }

    con.commit();

    out.put("ok", true).put("id", newId)
       .put("url", request.getContextPath() + "/upload" + relPath)
       .put("name", orig);

  } catch (Exception ex) {
    if (con != null) try { con.rollback(); } catch (SQLException ignore) {}
    if (saved != null && saved.exists()) saved.delete();       // remove the file too if the DB write failed
    getServletContext().log("upload.jsp failed", ex);
    out = new JSONObject().put("ok", false).put("message", String.valueOf(ex.getMessage()));
    response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
  } finally {
    if (con != null) try { con.setAutoCommit(true); con.close(); } catch (SQLException ignore) {}
  }

  out.write(response.getWriter());
%>
