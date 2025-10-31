#!/usr/bin/env Rscript
# setup-r-lib.R
# Usage:
#   Rscript setup-r-lib.R "<lib_dir>" "jsonlite,httr,remotes"
# Notes:
# - Works on Windows/macOS/Linux. Pass Windows paths as raw args; we normalize them.

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 1 || nchar(args[[1]]) == 0) {
  message("Usage: Rscript setup-r-lib.R <lib_dir> [packages_csv]")
  quit(status = 2)
}

# Inputs
lib_input <- args[[1]]
pkgs_csv  <- if (length(args) >= 2) args[[2]] else "jsonlite,httr"

# Normalize path safely (avoid backslash escape issues)
lib <- tryCatch(normalizePath(lib_input, winslash = "/", mustWork = FALSE),
                error = function(e) lib_input)

# Make sure the directory exists
if (!dir.exists(lib)) {
  dir.create(lib, recursive = TRUE, showWarnings = FALSE)
  if (!dir.exists(lib)) {
    message("Failed to create library directory: ", lib)
    quit(status = 3)
  }
}

# Configure repos (overrideable via env CRAN_MIRROR)
cran <- Sys.getenv("CRAN_MIRROR", "https://cran.r-project.org")
options(repos = c(CRAN = cran), Ncpus = max(1L, parallel::detectCores(logical = TRUE) - 1L))

# Point R to the portable library first
.libPaths(lib)

# Parse packages list
pkgs <- unique(stats::na.omit(strsplit(pkgs_csv, "\\s*,\\s*")[[1]]))
pkgs <- pkgs[nzchar(pkgs)]

if (!length(pkgs)) {
  message("No packages requested; library directory prepared at: ", lib)
  quit(status = 0)
}

# Helper to install missing packages
install_missing <- function(packages, lib) {
  installed <- rownames(installed.packages(lib.loc = lib, noCache = TRUE))
  to_get    <- setdiff(packages, installed)

  if (!length(to_get)) {
    message("All requested packages already installed in: ", lib)
    return(invisible(TRUE))
  }

  message("Installing packages to ", lib, ": ", paste(to_get, collapse = ", "))
  tryCatch({
    install.packages(to_get, lib = lib, dependencies = TRUE, quiet = TRUE)
    TRUE
  }, error = function(e) {
    message("install.packages error: ", conditionMessage(e))
    FALSE
  })
}

ok <- install_missing(pkgs, lib)

# Verify
missing_after <- setdiff(pkgs, rownames(installed.packages(lib.loc = lib, noCache = TRUE)))

if (!ok || length(missing_after)) {
  if (length(missing_after)) {
    message("Still missing after install: ", paste(missing_after, collapse = ", "))
  }
  quit(status = 4)
}

# Nice diagnostics
message("Library ready at: ", lib)
message("Installed packages: ", paste(pkgs, collapse = ", "))
utils::sessionInfo()

quit(status = 0)
