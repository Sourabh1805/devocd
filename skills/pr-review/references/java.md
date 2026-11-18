# Java

Load when the diff changes `*.java`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `settings.gradle*` or `gradle.properties`.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Build and tests: `mvn test` or `./gradlew test`.
- Static analysis: SpotBugs, PMD or Checkstyle, when the build configures them.

A change to `pom.xml`, a Gradle build or settings file, the Gradle or Maven wrapper, or a plugin's config means asking again before any approved command. The wrapper downloads and runs code.

## Look for

- `Optional.get()` without a check, and values that can be null used without one.
- Streams, readers and connections not closed: use try-with-resources.
- `catch (Exception e) {}` that hides failures; errors logged and then ignored.
- Strings compared with `==`.
- `equals` overridden without `hashCode`, or the reverse.
- SQL built by string joining; use `PreparedStatement` parameters.
- `ObjectInputStream` on outside data; XML parsers with external entities left on (XXE).
- Shared mutable state across threads: `SimpleDateFormat`, `HashMap`, static fields.
- Money in `double` or `float` instead of `BigDecimal` or integer cents.
- Spring: a new endpoint with no `@PreAuthorize` or security rule where its neighbours have one; request bodies with no `@Valid`.
- Secrets or personal data written to logs.
