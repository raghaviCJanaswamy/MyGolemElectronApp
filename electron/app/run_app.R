#!/usr/bin/env Rscript
# run_app.R — robust launcher for Shiny/golem apps (with safe fallback)

# ---- Prefer portable libs from env (vendored runtime) ----
portable <- unique(c(
  Sys.getenv("R_LIBS_USER", ""),
  Sys.getenv("R_LIBS_SITE", ""),
  Sys.getenv("RENV_PATHS_LIBRARY", "")
))
portable <- portable[nzchar(portable)]
if (length(portable)) .libPaths(unique(c(portable, .libPaths())))

# ---- Require shiny, print helpful error if missing ----
if (!requireNamespace("shiny", quietly = TRUE)) {
  stop("Package 'shiny' is not installed in the active library.\n",
       "Active libs: ", paste(.libPaths(), collapse = " | "), call. = FALSE)
}

# ---- Parse args: --host / --port (defaults) ----
args <- commandArgs(trailingOnly = TRUE)
host <- "127.0.0.1"; port <- 7777L
i <- 1L
while (i <= length(args)) {
  if (identical(args[i], "--host") && i < length(args)) { host <- args[i + 1L]; i <- i + 2L; next }
  if (identical(args[i], "--port") && i < length(args)) { port <- as.integer(args[i + 1L]); i <- i + 2L; next }
  i <- i + 1L
}

# ---- Find this script's directory reliably ----
args_all   <- commandArgs(trailingOnly = FALSE)
file_arg   <- grep("^--file=", args_all, value = TRUE)
scriptfile <- if (length(file_arg)) sub("^--file=", "", file_arg[1]) else ""
script_dir <- if (nzchar(scriptfile)) dirname(scriptfile) else getwd()
script_dir <- normalizePath(script_dir, winslash = "/", mustWork = FALSE)

# ---- Resolve app directory or entrypoint ----
pick_app_dir <- function(base) {
  # 1) Explicit override via env APP_SUBDIR
  subdir <- Sys.getenv("APP_SUBDIR", "")
  if (nzchar(subdir)) {
    cand <- file.path(base, subdir)
    if (dir.exists(cand)) return(cand)
  }
  # 2) Common layouts
  cand <- file.path(base, "shiny");                    if (dir.exists(cand)) return(cand)
  # Treat base itself as the app if it has app.R or ui/server
  if (file.exists(file.path(base, "app.R")))           return(base)
  if (file.exists(file.path(base, "ui.R")) &&
      file.exists(file.path(base, "server.R")))        return(base)
  # 3) Nothing obvious
  return(NA_character_)
}

app_dir <- pick_app_dir(script_dir)

# ---- Start app (or safe fallback) ----
message(sprintf("R: %s", R.version.string))
message(".libPaths(): ", paste(.libPaths(), collapse = " | "))
message("Script dir: ", script_dir)

if (!is.na(app_dir)) {
  message("Launching Shiny app from: ", app_dir)
  message("Target: http://", host, ":", port)
  shiny::runApp(appDir = app_dir, host = host, port = port, launch.browser = FALSE)
} else {
  # Fallback inline app so it never goes silent
  message("No app folder found next to run_app.R (looked for 'shiny/', 'app.R', or 'ui.R'+'server.R').")
  message("Starting fallback test app at http://", host, ":", port)
  ui <- shiny::fluidPage(
    shiny::titlePanel("Vendored R Test"),
    shiny::tags$hr(),
    shiny::p(sprintf("R: %s", R.version.string)),
    shiny::p(sprintf(".libPaths(): %s", paste(.libPaths(), collapse = " | "))),
    shiny::p(sprintf("Host: %s  |  Port: %s", host, port)),
    shiny::actionButton("ping", "Ping"),
    shiny::verbatimTextOutput("out")
  )
  server <- function(input, output, session) {
    shiny::observeEvent(input$ping, {
      output$out <- shiny::renderPrint({
        list(time = Sys.time(), pid = Sys.getpid(), wd = normalizePath(getwd(), winslash = "/"))
      })
    })
  }
  shiny::runApp(list(ui = ui, server = server), host = host, port = port, launch.browser = FALSE)
}
