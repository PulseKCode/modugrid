<%--
  ══════════════════════════════════════════════════════════════════════════
  submit.jsp — Receives a ModuGrid change set (JSP + Oracle)

  Request  : POST, application/x-www-form-urlencoded; charset=UTF-8
             changes=<URL-encoded JSON>

             {
               "inserted": [ {"id":-1,"name":"John Doe","status":"active","role":"Dev",
                              "score":80,"progress":50,"salary":5000000,
                              "joined":"2026-08-01","memo":""} ],
               "updated" : [ {"id":12,"changes":{"score":95,"memo":"edited"}} ],
               "deleted" : [ 7, 9 ]
             }

  Response : application/json
             {"ok":true,"inserted":1,"updated":1,"deleted":2,
              "idMap":{"-1":10231}}                 // temporary id of a new row -> real id
             {"ok":false,"message":"..."}           // on failure (whole transaction rolled back)

  Requires : org.json (json-20231013.jar) in WEB-INF/lib.
             If you use a different JSON library, only the parsing part needs replacing.
  ══════════════════════════════════════════════════════════════════════════

  -- Example DDL ----------------------------------------------------------
  CREATE TABLE EMP_GRID (
    ID        NUMBER        PRIMARY KEY,
    NAME      VARCHAR2(100) NOT NULL,
    STATUS    VARCHAR2(20),
    ROLE_NM   VARCHAR2(50),        -- ROLE is an Oracle reserved word, hence ROLE_NM
    SCORE     NUMBER(5,2),
    PROGRESS  NUMBER(5,2),
    SALARY    NUMBER(15),
    JOINED    DATE,
    MEMO      VARCHAR2(4000),
    UPD_DT    DATE DEFAULT SYSDATE
  );
  CREATE SEQUENCE SEQ_EMP_GRID START WITH 1 INCREMENT BY 1 NOCACHE;
  ------------------------------------------------------------------------
--%>
<%@ page contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" session="false" %>
<%@ page import="java.sql.*, java.util.*, javax.sql.DataSource, javax.naming.InitialContext" %>
<%@ page import="org.json.JSONObject, org.json.JSONArray" %>
<%!
  /* ── Configuration ─────────────────────────────────────────────────── */
  private static final String DS_NAME  = "java:comp/env/jdbc/oraDS";   // JNDI DataSource
  private static final String TABLE    = "EMP_GRID";
  private static final String SEQ      = "SEQ_EMP_GRID";

  /* Whitelist: client field name -> {DB column, type}
     Any field not listed here is ignored entirely. This is the core defense
     against SQL injection, so never use a client-supplied key as a column name. */
  private static final Map<String,String[]> COLS = new LinkedHashMap<String,String[]>();
  static {
    COLS.put("name",     new String[]{"NAME",     "S"});   // S = string
    COLS.put("status",   new String[]{"STATUS",   "S"});
    COLS.put("role",     new String[]{"ROLE_NM",  "S"});
    COLS.put("score",    new String[]{"SCORE",    "N"});   // N = number
    COLS.put("progress", new String[]{"PROGRESS", "N"});
    COLS.put("salary",   new String[]{"SALARY",   "N"});
    COLS.put("joined",   new String[]{"JOINED",   "D"});   // D = date (yyyy-MM-dd)
    COLS.put("memo",     new String[]{"MEMO",     "S"});
  }

  /* Bind a single JSON value to the PreparedStatement, by type */
  private void bind(PreparedStatement ps, int idx, String type, Object v) throws SQLException {
    boolean empty = (v == null || JSONObject.NULL.equals(v) || String.valueOf(v).trim().isEmpty());
    if ("N".equals(type)) {
      if (empty) { ps.setNull(idx, Types.NUMERIC); return; }
      try { ps.setBigDecimal(idx, new java.math.BigDecimal(String.valueOf(v).replace(",", "").trim())); }
      catch (NumberFormatException e) { ps.setNull(idx, Types.NUMERIC); }
    } else if ("D".equals(type)) {
      if (empty) { ps.setNull(idx, Types.DATE); return; }
      // The client sends dates using options.dateFormat (yyyy-mm-dd by default)
      ps.setString(idx, String.valueOf(v).trim());
    } else {
      if (empty) { ps.setNull(idx, Types.VARCHAR); return; }
      ps.setString(idx, String.valueOf(v));
    }
  }

  /* Date columns need TO_DATE(?, ...) in place of the plain bind marker */
  private String ph(String type) {
    return "D".equals(type) ? "TO_DATE(?, 'YYYY-MM-DD')" : "?";
  }
%>
<%
  request.setCharacterEncoding("UTF-8");
  response.setHeader("Cache-Control", "no-store");

  JSONObject out = new JSONObject();
  Connection con = null;

  try {
    /* ── 1. Parse the payload ───────────────────────────────────────── */
    String raw = request.getParameter("changes");
    if (raw == null || raw.trim().isEmpty()) throw new IllegalArgumentException("missing 'changes' parameter");

    JSONObject ch       = new JSONObject(raw);
    JSONArray  inserted = ch.optJSONArray("inserted");
    JSONArray  updated  = ch.optJSONArray("updated");
    JSONArray  deleted  = ch.optJSONArray("deleted");
    if (inserted == null) inserted = new JSONArray();
    if (updated  == null) updated  = new JSONArray();
    if (deleted  == null) deleted  = new JSONArray();

    /* ── 2. Get a connection and begin the transaction ──────────────── */
    DataSource ds = (DataSource) new InitialContext().lookup(DS_NAME);
    con = ds.getConnection();
    con.setAutoCommit(false);

    int nIns = 0, nUpd = 0, nDel = 0;
    JSONObject idMap = new JSONObject();   // client temporary id -> id assigned by the server

    /* ── 3. INSERT ──────────────────────────────────────────────────
       The id is assigned server-side from the sequence. The id sent by the
       client is a temporary value used internally by the grid, so it is
       never trusted.                                                     */
    if (inserted.length() > 0) {
      StringBuilder cols = new StringBuilder("ID");
      StringBuilder vals = new StringBuilder(SEQ + ".NEXTVAL");
      for (Map.Entry<String,String[]> e : COLS.entrySet()) {
        cols.append(", ").append(e.getValue()[0]);
        vals.append(", ").append(ph(e.getValue()[1]));
      }
      String sql = "INSERT INTO " + TABLE + " (" + cols + ") VALUES (" + vals + ")";

      for (int i = 0; i < inserted.length(); i++) {
        JSONObject r = inserted.getJSONObject(i);
        PreparedStatement ps = con.prepareStatement(sql, new String[]{"ID"});
        try {
          int idx = 1;
          for (Map.Entry<String,String[]> e : COLS.entrySet())
            bind(ps, idx++, e.getValue()[1], r.opt(e.getKey()));
          nIns += ps.executeUpdate();

          ResultSet gk = ps.getGeneratedKeys();      // collect the generated ID
          try { if (gk.next()) idMap.put(String.valueOf(r.opt("id")), gk.getLong(1)); }
          finally { gk.close(); }
        } finally { ps.close(); }
      }
    }

    /* ── 4. UPDATE — build the SET clause from changed fields only ───── */
    for (int i = 0; i < updated.length(); i++) {
      JSONObject u   = updated.getJSONObject(i);
      JSONObject chg = u.optJSONObject("changes");
      if (chg == null || chg.length() == 0) continue;

      List<String> keys = new ArrayList<String>();
      StringBuilder set = new StringBuilder();
      for (Iterator<String> it = chg.keys(); it.hasNext(); ) {
        String k = it.next();
        String[] meta = COLS.get(k);
        if (meta == null) continue;                 // not in the whitelist -> ignore
        if (set.length() > 0) set.append(", ");
        set.append(meta[0]).append(" = ").append(ph(meta[1]));
        keys.add(k);
      }
      if (keys.isEmpty()) continue;

      String sql = "UPDATE " + TABLE + " SET " + set + ", UPD_DT = SYSDATE WHERE ID = ?";
      PreparedStatement ps = con.prepareStatement(sql);
      try {
        int idx = 1;
        for (String k : keys) bind(ps, idx++, COLS.get(k)[1], chg.opt(k));
        ps.setLong(idx, u.getLong("id"));
        nUpd += ps.executeUpdate();
      } finally { ps.close(); }
    }

    /* ── 5. DELETE — batched ────────────────────────────────────────── */
    if (deleted.length() > 0) {
      PreparedStatement ps = con.prepareStatement("DELETE FROM " + TABLE + " WHERE ID = ?");
      try {
        for (int i = 0; i < deleted.length(); i++) { ps.setLong(1, deleted.getLong(i)); ps.addBatch(); }
        for (int n : ps.executeBatch()) if (n > 0) nDel += n;
      } finally { ps.close(); }
    }

    /* ── 6. Commit ──────────────────────────────────────────────────── */
    con.commit();

    out.put("ok", true).put("inserted", nIns).put("updated", nUpd)
       .put("deleted", nDel).put("idMap", idMap);

  } catch (Exception ex) {
    if (con != null) try { con.rollback(); } catch (SQLException ignore) {}
    // In production, do not expose the detailed message to the client; log it instead
    getServletContext().log("submit.jsp failed", ex);
    out = new JSONObject().put("ok", false).put("message", String.valueOf(ex.getMessage()));
    response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
  } finally {
    if (con != null) try { con.setAutoCommit(true); con.close(); } catch (SQLException ignore) {}
  }

  out.write(response.getWriter());
%>
